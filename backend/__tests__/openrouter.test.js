const { generateBookMetadataSuggestion, OpenRouterConfigError } = require('../utils/openrouter');

describe('generateBookMetadataSuggestion', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  test('throws OpenRouterConfigError when no API key is configured', async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(generateBookMetadataSuggestion({ title: 'Dracula', author: 'Bram Stoker' })).rejects.toBeInstanceOf(
      OpenRouterConfigError,
    );
  });

  test('sends the expected request shape and parses a clean JSON reply', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.OPENROUTER_MODEL = 'openai/gpt-4o-mini';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"description": "A gothic tale.", "subjects": ["Horror", "Gothic"]}' } }],
      }),
    });

    const result = await generateBookMetadataSuggestion({
      title: 'Dracula',
      author: 'Bram Stoker',
      category: 'Horror',
      existingSubjects: [],
      existingDescription: '',
      textExcerpt: 'Jonathan Harker\'s journal...',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody.model).toBe('openai/gpt-4o-mini');
    expect(result).toEqual({ description: 'A gothic tale.', subjects: ['Horror', 'Gothic'] });
  });

  test('strips ```json fences before parsing, in case the model ignores the format instruction', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"description": "Fenced.", "subjects": []}\n```' } }],
      }),
    });

    const result = await generateBookMetadataSuggestion({ title: 'X', author: 'Y' });
    expect(result.description).toBe('Fenced.');
  });

  test('raises a readable error when OpenRouter responds with a non-2xx status', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 402,
      statusText: 'Payment Required',
      text: async () => 'Insufficient credits',
    });

    await expect(generateBookMetadataSuggestion({ title: 'X', author: 'Y' })).rejects.toThrow(/402/);
  });
});
