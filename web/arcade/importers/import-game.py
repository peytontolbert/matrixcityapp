#!/usr/bin/env python3
"""Create a private browser asset pack from an installed game you own.

Reads only a selected Unity bundle; never uploads files or exports assemblies.
Generated graphics belong to their respective owners. Do not redistribute them.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile

MAX_BUNDLE_BYTES = 256 * 1024 * 1024
MAX_TEXTURE_PIXELS = 16_777_216
MAX_TEXTURE_EDGE = 8192
MAX_TOTAL_PIXELS = 67_108_864
MAX_OBJECTS = 100_000
MAX_DEFINITIONS = 20_000
MAX_FRAMES = 1024
MAX_PACK_BYTES = 64 * 1024 * 1024

# Object identifiers are compatibility selectors, not extracted artwork.
BROFORCE_TEXTURES = {
    -3458093236565277518: "rambro.webp",
    -525182468562816514: "rambro-gun.webp",
    3893108750786533398: "mook.webp",
    -4554044862918687716: "mook-gun.webp",
    5554021125734014869: "jungle-parallax.webp",
    -7822668051170095931: "jungle-dirt.webp",
    7835765782447898677: "jungle-destructibles.webp",
    5920087946963737313: "bridge.webp",
    -3877251718628479028: "checkpoint.webp",
    3613458758616318809: "crate.webp",
    8295508989657769425: "flag.webp",
    3101479838932609191: "bullet.webp",
    -6174765456400923056: "explosion.webp",
}
COLLECTIONS = {
    "marine": (
        "assets/sprites/characters/marine data/atlas0.png",
        "assets/sprites/characters/marine data/marine.prefab",
        [r"marine_(idle|run|dodge)_(front|back|front_right|back_right)_\d+", r"marine_death_front_\d+"],
    ),
    "bulletkin": (
        "assets/sprites/enemies/bulletmanspritecollection data/atlas0.png",
        "assets/sprites/enemies/bulletmanspritecollection data/bulletmanspritecollection.prefab",
        [r"bullet_(idle_right|run_right|death_right_side)_\d+"],
    ),
    "weapons": (
        "assets/sprites/weapons/weaponcollection data/atlas0.png",
        "assets/sprites/weapons/weaponcollection data/weaponcollection.prefab",
        [r"magnum_(idle|shoot|reload)_\d+", r"shotgun_(idle|fire|recoil|cock)_\d+"],
    ),
    "tiles": (
        "assets/sprites/collections/env_tileset_gungeon data/atlas0.png",
        "assets/sprites/collections/env_tileset_gungeon data/env_tileset_gungeon.prefab",
        [r"ENV_Tileset_Gungeon/([0-5]?\d|6[0-4])"],
    ),
}


class ImportFailure(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ImportFailure(message)


def find_bundle(root, game):
    filename = "sharedtextures.assetbundle" if game == "broforce" else "shared_auto_001"
    # Bounded discovery accommodates Windows/Linux/macOS installation layouts.
    matches, visited = [], 0
    for folder, directories, filenames in os.walk(root, followlinks=False):
        here = Path(folder)
        require(len(here.relative_to(root).parts) <= 12, "Installation directory is too deeply nested.")
        directories[:] = [d for d in directories if not (here / d).is_symlink()]
        visited += len(directories) + len(filenames)
        require(visited <= 50_000, "Too many files; select only this game's installation directory.")
        for name in filenames:
            if name.lower() == filename:
                candidate = here / name
                if not candidate.is_symlink() and candidate.resolve().is_relative_to(root):
                    matches.append(candidate)
    require(len(matches) == 1, f"Expected exactly one {filename}; found {len(matches)}. Select the game installation directory.")
    bundle = matches[0]
    require(0 < bundle.stat().st_size <= MAX_BUNDLE_BYTES, "Bundle exceeds the supported 256 MiB size limit.")
    return bundle


def decode_texture(obj):
    texture = obj.read()
    width, height = int(texture.m_Width), int(texture.m_Height)
    require(0 < width <= MAX_TEXTURE_EDGE and 0 < height <= MAX_TEXTURE_EDGE and width * height <= MAX_TEXTURE_PIXELS,
            "Texture exceeds supported dimensions.")
    image = texture.image.convert("RGBA")
    require(image.size == (width, height), "Decoded texture size does not match its header.")
    return image


def broforce_images(environment):
    images, pixels = {}, 0
    for obj in environment.objects:
        if obj.type.name == "Texture2D" and obj.path_id in BROFORCE_TEXTURES:
            name = BROFORCE_TEXTURES[obj.path_id]
            require(name not in images, "Duplicate required texture; this game version is unsupported.")
            image = decode_texture(obj)
            pixels += image.width * image.height
            require(pixels <= MAX_TOTAL_PIXELS, "Selected textures exceed the decoded size limit.")
            images[name] = image
    require(len(images) == len(BROFORCE_TEXTURES), "Required Broforce textures are missing. This game build is unsupported; no pack was written.")
    return images, {"schema": "lanparty-broforce-assets-v1"}


def sprite_definitions(environment, prefab_path):
    game_object = environment.container[prefab_path].read()
    for component in game_object.m_Component:
        pointer = getattr(component, "component", component)
        if pointer.type.name == "MonoBehaviour":
            behaviour = pointer.read()
            if behaviour.m_Script.read().m_Name == "tk2dSpriteCollectionData":
                definitions = pointer.read_typetree()["spriteDefinitions"]
                require(len(definitions) <= MAX_DEFINITIONS, "Sprite collection exceeds the supported definition count.")
                return definitions
    raise ImportFailure("Required Gungeon sprite collection is missing; this game build is unsupported.")


def gungeon_images(environment, Image):
    selected, pixels = [], 0
    for group, (texture_path, prefab_path, patterns) in COLLECTIONS.items():
        require(texture_path in environment.container and prefab_path in environment.container,
                "Required Gungeon collection is missing; this game build is unsupported.")
        texture = decode_texture(environment.container[texture_path])
        pixels += texture.width * texture.height
        require(pixels <= MAX_TOTAL_PIXELS, "Selected textures exceed the decoded size limit.")
        expressions = [re.compile(pattern, re.I) for pattern in patterns]
        count = 0
        for definition in sprite_definitions(environment, prefab_path):
            name = definition.get("name", "")
            if not isinstance(name, str) or not any(regex.fullmatch(name) for regex in expressions):
                continue
            uvs = definition["uvs"]
            require(3 <= len(uvs) <= 16, "Unsupported sprite UV geometry.")
            xs, ys = [float(p["x"]) for p in uvs], [float(p["y"]) for p in uvs]
            require(all(math.isfinite(v) and 0 <= v <= 1 for v in xs + ys), "Invalid sprite UV coordinate.")
            left, right = math.floor(min(xs) * texture.width), math.ceil(max(xs) * texture.width)
            top, bottom = math.floor((1 - max(ys)) * texture.height), math.ceil((1 - min(ys)) * texture.height)
            require(0 < right - left <= 1020 and 0 < bottom - top <= 1020, "Unsupported sprite dimensions.")
            image = texture.crop((left, top, right, bottom))
            if int(definition.get("flipped", 0)):
                image = image.transpose(Image.Transpose.ROTATE_90)
            selected.append((group, name, image))
            require(len(selected) <= MAX_FRAMES, "Too many selected sprite frames.")
            count += 1
        require(count > 0, f"Required {group} sprites are missing; this game build is unsupported.")
    selected.sort(key=lambda item: (item[0], item[1]))
    x = y = 2
    row_height, placements = 0, []
    for group, name, image in selected:
        if x + image.width + 2 > 1024:
            x, y, row_height = 2, y + row_height + 2, 0
        placements.append((group, name, image, x, y))
        x += image.width + 2
        row_height = max(row_height, image.height)
    height = y + row_height + 2
    require(height <= MAX_TEXTURE_EDGE, "Generated atlas exceeds supported dimensions.")
    atlas, frames = Image.new("RGBA", (1024, height)), {}
    for group, name, image, x, y in placements:
        require(name not in frames, "Duplicate sprite names; this game build is unsupported.")
        atlas.alpha_composite(image, (x, y))
        frames[name] = {"group": group, "x": x, "y": y, "w": image.width, "h": image.height}
    return {"gungeon-atlas.webp": atlas}, {"game": "Enter the Gungeon", "frames": frames}


def write_pack(output, images, manifest, game):
    # Decode/validate completely before creating final files. Never overwrite files.
    output.mkdir(parents=True, exist_ok=True)
    require(not any(output.iterdir()), "Output directory must be empty; existing files will not be overwritten.")
    with tempfile.TemporaryDirectory(prefix=".import-", dir=output) as temporary:
        stage = Path(temporary)
        assets, total = [], 0
        for filename, image in sorted(images.items()):
            path = stage / filename
            image.save(path, "WEBP", lossless=True, method=6)
            payload = path.read_bytes()
            total += len(payload)
            require(total <= MAX_PACK_BYTES, "Generated pack exceeds the 64 MiB size limit.")
            assets.append({"file": filename, "width": image.width, "height": image.height,
                           "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()})
        if game == "broforce":
            manifest.update(assets=assets, totalBytes=total)
        else:
            manifest["atlas"] = assets[0]
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        # Exclusive creation prevents races from overwriting a user's files.
        # Manifest is the completion marker and is written last.
        for filename in [*sorted(images), "manifest.json"]:
            target = output / filename
            with target.open("xb") as stream:
                stream.write((stage / filename).read_bytes())
    return total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game", choices=["broforce", "gungeon"])
    parser.add_argument("installation", type=Path, help="directory of your installed game")
    parser.add_argument("output", type=Path, help="new or empty private asset output directory")
    args = parser.parse_args()
    try:
        root, output = args.installation.resolve(), args.output.resolve()
        require(root.is_dir(), "Installation directory does not exist.")
        require(not output.is_relative_to(root), "Output must be outside the game installation.")
        require(not output.exists() or output.is_dir() and not any(output.iterdir()), "Output directory must be new or empty.")
        bundle = find_bundle(root, args.game)
        try:
            import UnityPy
            from PIL import Image
        except ImportError as exc:
            raise ImportFailure("Dependencies are missing. Run: python -m pip install -r requirements.txt") from exc
        environment = UnityPy.load(str(bundle))
        require(len(environment.objects) <= MAX_OBJECTS, "Bundle exceeds supported object count.")
        images, manifest = broforce_images(environment) if args.game == "broforce" else gungeon_images(environment, Image)
        total = write_pack(output, images, manifest, args.game)
        print(json.dumps({"game": args.game, "files": len(images) + 1, "assetBytes": total, "status": "complete"}))
        return 0
    except ImportFailure as exc:
        print(f"Import failed: {exc}", file=sys.stderr)
    except Exception as exc:
        # Do not dump internal game data, absolute paths or parser traceback.
        print(f"Import failed ({type(exc).__name__}): cannot decode this game build or write its pack. Check the installation and choose an empty writable output directory.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
