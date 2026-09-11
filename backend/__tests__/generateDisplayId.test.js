jest.mock('../models/Counter', () => ({
  findOneAndUpdate: jest.fn(),
}));

const Counter = require('../models/Counter');
const generateDisplayId = require('../utils/generateDisplayId');

describe('utils/generateDisplayId', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('pads the sequence to 6 digits and prefixes admin ids with AD-', async () => {
    Counter.findOneAndUpdate.mockResolvedValue({ seq: 1 });

    const id = await generateDisplayId('admin');

    expect(id).toBe('AD-000001');
    expect(Counter.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'user_admin' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
  });

  test('prefixes manager ids with MA- and employee ids with EM-', async () => {
    Counter.findOneAndUpdate.mockResolvedValueOnce({ seq: 42 });
    expect(await generateDisplayId('manager')).toBe('MA-000042');

    Counter.findOneAndUpdate.mockResolvedValueOnce({ seq: 7 });
    expect(await generateDisplayId('employee')).toBe('EM-000007');
  });

  test('customer ids have no prefix, just the padded number', async () => {
    Counter.findOneAndUpdate.mockResolvedValue({ seq: 123 });

    const id = await generateDisplayId('customer');

    expect(id).toBe('000123');
  });

  test('sequence numbers beyond 6 digits are not truncated', async () => {
    Counter.findOneAndUpdate.mockResolvedValue({ seq: 1234567 });

    const id = await generateDisplayId('customer');

    expect(id).toBe('1234567');
  });
});
