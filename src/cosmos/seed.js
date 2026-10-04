// Deterministic Minecraft-style Seed and PRNG System (Mulberry32 + Murmur/Cyrb53 Hash)

export class SeededRNG {
  constructor(seed) {
    this.seedString = String(seed !== undefined && seed !== null ? seed : 'Genesis-1337');
    this.seed = this.hashString(this.seedString);
    this.state = this.seed;
  }

  // Hash string into 32-bit unsigned integer
  hashString(str) {
    let h1 = 0xdeadbeef ^ 0;
    let h2 = 0x41c6ce57 ^ 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0);
  }

  setSeed(seed) {
    this.seedString = String(seed);
    this.seed = this.hashString(this.seedString);
    this.state = this.seed;
  }

  // Mulberry32 fast PRNG
  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0; // stay a uint32 so the state saves exactly
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Range helper [min, max)
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer helper [min, max]
  rangeInt(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  // Pick random element from array deterministically
  choice(array) {
    if (!array || array.length === 0) return null;
    return array[this.rangeInt(0, array.length - 1)];
  }

  // Boolean with chance
  bool(chance = 0.5) {
    return this.next() < chance;
  }
}

// Global active seeded PRNG
export const globalRNG = new SeededRNG('Genesis-1337');
