#!/usr/bin/env python3
"""Read an owned Nuclear Throne data file using an installed UndertaleModCli."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('installation',type=Path);p.add_argument('output',type=Path)
 p.add_argument('--cli',required=True,help='Path to the official UndertaleModCli executable')
 a=p.parse_args();source=a.installation.resolve(strict=True);out=a.output.resolve()
 if not source.is_dir() or out==source or source in out.parents or out in source.parents:
  p.error('Choose a separate output directory outside the game installation')
 if a.output.is_symlink() or out.exists():p.error('Output must be a new directory')
 candidates=[source/n for n in ['data.win','game.unx','game.ios'] if (source/n).is_file()]
 if len(candidates)!=1 or candidates[0].is_symlink() or candidates[0].stat().st_size>2_000_000_000:
  p.error('Choose an installation containing one supported data.win/game.unx/game.ios file')
 script=Path(__file__).with_name('nuclear-assets.csx').resolve(strict=True)
 cli=Path(a.cli).resolve(strict=True)
 out.mkdir(parents=True)
 env=dict(os.environ,MATRIXGAMES_ASSET_OUTPUT=str(out))
 # UTMT may open external texture pages with write access even while reading.
 # Give it private copies so the installed game always remains read-only.
 with tempfile.TemporaryDirectory(prefix='.import-work-',dir=out) as scratch:
  scratch=Path(scratch);data=scratch/candidates[0].name;shutil.copyfile(candidates[0],data)
  textures=source/'tex'
  if textures.exists():
   if textures.is_symlink():p.error('Texture directory cannot be a symlink')
   pages=list(textures.glob('*.png'))
   if len(pages)>256 or sum(x.stat().st_size for x in pages)>1_000_000_000:p.error('Texture pages exceed limits')
   (scratch/'tex').mkdir()
   for page in pages:
    if page.is_symlink():p.error('Texture page cannot be a symlink')
    shutil.copyfile(page,scratch/'tex'/page.name)
  result=subprocess.run([str(cli),'load',str(data),'-s',str(script)],env=env,timeout=600,check=False)
 if result.returncode or not (out/'assets/sprites/manifest.json').is_file():
  raise SystemExit('Import failed; output was retained for diagnosis. Choose a new output directory when retrying.')
 music=source/'mus1.ogg'
 if music.is_file() and not music.is_symlink() and music.stat().st_size<32_000_000:shutil.copyfile(music,out/'assets/audio/mus1.ogg')
 print('Ready. Select the output folder in Matrix Games. Keep this asset pack private.')

if __name__=='__main__':main()
