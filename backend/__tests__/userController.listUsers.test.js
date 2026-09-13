jest.mock('../models/User');
jest.mock('../models/Book');
jest.mock('../config/firebaseAdmin');
jest.mock('../utils/mailer');

const User = require('../models/User');
const Book = require('../models/Book');
const { listUsers } = require('../controllers/userController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function fakeUser(overrides) {
  return {
    _id: 'id',
    displayId: 'BW-1',
    name: 'Someone',
    email: 'someone@example.com',
    role: 'customer',
    isRestricted: false,
    isResigned: false,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('listUsers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('role=customer: drops admins entirely and ranks by push count, most active first', async () => {
    const alice = fakeUser({ _id: 'alice', name: 'Alice', createdAt: new Date('2026-01-01') });
    const bob = fakeUser({ _id: 'bob', name: 'Bob', createdAt: new Date('2026-01-02') });
    const carol = fakeUser({ _id: 'carol', name: 'Carol', createdAt: new Date('2026-01-03') });

    User.find = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([alice, bob, carol]) });
    Book.aggregate = jest.fn().mockResolvedValue([
      { _id: 'bob', count: 2 },
      { _id: 'alice', count: 9 },
      // carol never pushed a book - should still show up, with bookCount 0.
    ]);

    const res = mockRes();
    listUsers({ query: { role: 'customer', page: '1', limit: '20' } }, res);
    await flush();

    expect(User.find).toHaveBeenCalledWith({ role: 'customer' });
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.users.map((user) => user.name)).toEqual(['Alice', 'Bob', 'Carol']);
    expect(payload.data.users.map((user) => user.bookCount)).toEqual([9, 2, 0]);
    // Admin accounts were never fetched in the first place for this branch.
    expect(payload.data.users.every((user) => user.role === 'customer')).toBe(true);
  });

  test('role=customer: pages the ranked list in memory', async () => {
    const users = ['a', 'b', 'c', 'd', 'e'].map((id, index) =>
      fakeUser({ _id: id, name: id, createdAt: new Date(2026, 0, index + 1) }),
    );
    User.find = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(users) });
    Book.aggregate = jest.fn().mockResolvedValue([]);

    const res = mockRes();
    listUsers({ query: { role: 'customer', page: '2', limit: '2' } }, res);
    await flush();

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.total).toBe(5);
    expect(payload.data.page).toBe(2);
    expect(payload.data.users.map((user) => user.name)).toEqual(['c', 'b']);
  });

  test('no role filter: keeps the original DB-level pagination and no bookCount field', async () => {
    const users = [fakeUser({ _id: 'x', role: 'admin' })];
    User.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(users) }) }),
    });
    User.countDocuments = jest.fn().mockResolvedValue(1);

    const res = mockRes();
    listUsers({ query: { page: '1', limit: '20' } }, res);
    await flush();

    expect(User.find).toHaveBeenCalledWith({});
    expect(Book.aggregate).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.users[0]).not.toHaveProperty('bookCount');
  });
});
