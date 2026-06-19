// Unit tests for PlantIdentifierService (Req 11): the pure PlantNet response
// mapping and the identify() failure handling (HTTP error, timeout, zero
// matches → uniform manual-fallback error). `fetch` is mocked; no network.

import {
  IDENTIFY_TIMEOUT_MS,
  MAX_MATCHES,
  PlantIdentifierError,
  identifyPlant,
  mapPlantNetResponse,
} from '@/services/PlantIdentifierService';

// expo-constants is imported for the API key; stub it.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { plantNetApiKey: 'test-key' } } },
}));

describe('mapPlantNetResponse', () => {
  it('maps results to ranked matches with whole-percent confidence', () => {
    const matches = mapPlantNetResponse({
      results: [
        { score: 0.873, species: { scientificNameWithoutAuthor: 'Monstera deliciosa', commonNames: ['Swiss cheese plant'] } },
        { score: 0.1, species: { scientificNameWithoutAuthor: 'Ficus lyrata', commonNames: [] } },
      ],
    });
    expect(matches).toEqual([
      { id: 'Monstera deliciosa', commonName: 'Swiss cheese plant', scientificName: 'Monstera deliciosa', confidence: 87 },
      { id: 'Ficus lyrata', commonName: 'Ficus lyrata', scientificName: 'Ficus lyrata', confidence: 10 },
    ]);
  });

  it('truncates to at most MAX_MATCHES and skips entries with no scientific name', () => {
    const matches = mapPlantNetResponse({
      results: [
        { score: 0.9, species: { scientificNameWithoutAuthor: 'A a' } },
        { score: 0.8, species: { commonNames: ['no latin'] } }, // skipped
        { score: 0.7, species: { scientificNameWithoutAuthor: 'B b' } },
        { score: 0.6, species: { scientificNameWithoutAuthor: 'C c' } },
        { score: 0.5, species: { scientificNameWithoutAuthor: 'D d' } }, // beyond MAX
      ],
    });
    expect(matches).toHaveLength(MAX_MATCHES);
    expect(matches.map((m) => m.scientificName)).toEqual(['A a', 'B b', 'C c']);
  });

  it('returns an empty array for no results', () => {
    expect(mapPlantNetResponse({})).toEqual([]);
    expect(mapPlantNetResponse({ results: [] })).toEqual([]);
  });
});

describe('identifyPlant', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('returns mapped matches on a successful response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ score: 0.42, species: { scientificNameWithoutAuthor: 'Aloe vera', commonNames: ['Aloe'] } }],
      }),
    });
    const matches = await identifyPlant('file:///photo.jpg');
    expect(matches[0]).toEqual({ id: 'Aloe vera', commonName: 'Aloe', scientificName: 'Aloe vera', confidence: 42 });
  });

  it('throws PlantIdentifierError on a non-OK HTTP response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(identifyPlant('file:///x.jpg')).rejects.toBeInstanceOf(PlantIdentifierError);
  });

  it('throws PlantIdentifierError when there are zero matches', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    await expect(identifyPlant('file:///x.jpg')).rejects.toBeInstanceOf(PlantIdentifierError);
  });

  it('throws PlantIdentifierError on a network failure / abort', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    const err = await identifyPlant('file:///x.jpg').catch((e) => e);
    expect(err).toBeInstanceOf(PlantIdentifierError);
    expect(err.message).toMatch(/enter the species manually/i);
  });

  it('uses a 15-second timeout budget', () => {
    expect(IDENTIFY_TIMEOUT_MS).toBe(15000);
  });
});
