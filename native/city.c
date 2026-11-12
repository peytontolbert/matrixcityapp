// Standalone procedural preview. No operating-system calls or imported runtime.
#include <stdint.h>
static uint32_t mix(uint32_t n) {
  n ^= n >> 16; n *= 0x7feb352du; n ^= n >> 15;
  n *= 0x846ca68bu; return n ^ (n >> 16);
}
uint32_t abi_version(void) { return 1; }
uint32_t block_height(uint32_t x, uint32_t y, uint32_t seed, uint32_t density) {
  if (x >= 16 || y >= 16 || x % 4 == 0 || y % 4 == 0) return 0;
  if (density > 100) density = 100;
  uint32_t value = mix(x * 73856093u ^ y * 19349663u ^ seed);
  if (value % 100 >= density) return 0;
  return 12 + (value >> 8) % 65;
}
uint32_t block_tone(uint32_t x, uint32_t y, uint32_t seed) {
  return mix(x * 37u ^ y * 101u ^ seed) % 4;
}
