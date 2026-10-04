jest.mock('../models/Notification');
jest.mock('../models/User');

const Notification = require('../models/Notification');
const {
  getBroadcastHistory,
  deleteNotification,
} = require('../controllers/notificationController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('NotificationController Broadcasts', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBroadcastHistory', () => {
    test('returns formatted history of broadcasts with audience and readCount', async () => {
      const mockNotifications = [
        {
          _id: 'notif-1',
          title: 'System Update',
          message: 'Maintenance at midnight',
          audience: 'all-customers',
          targetUser: null,
          createdBy: { _id: 'admin-1', name: 'Super Admin', role: 'admin' },
          readBy: ['user-1', 'user-2'],
          createdAt: new Date('2026-10-04T12:00:00Z'),
        },
        {
          _id: 'notif-2',
          title: 'Direct Warning',
          message: 'Please review guidelines',
          audience: 'single-customer',
          targetUser: { _id: 'user-3', name: 'Reader One', email: 'reader@example.com' },
          createdBy: { _id: 'admin-1', name: 'Super Admin', role: 'admin' },
          readBy: [],
          createdAt: new Date('2026-10-04T13:00:00Z'),
        },
      ];

      const limitMock = jest.fn().mockResolvedValue(mockNotifications);
      const sortMock = jest.fn().mockReturnValue({ limit: limitMock });
      const populate2Mock = jest.fn().mockReturnValue({ sort: sortMock });
      const populate1Mock = jest.fn().mockReturnValue({ populate: populate2Mock });

      Notification.find = jest.fn().mockReturnValue({ populate: populate1Mock });

      const req = { user: { _id: 'admin-1', role: 'admin' } };
      const res = mockRes();

      getBroadcastHistory(req, res);
      await flush();

      expect(Notification.find).toHaveBeenCalledWith({});
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.broadcasts).toHaveLength(2);
      expect(payload.data.broadcasts[0].title).toBe('System Update');
      expect(payload.data.broadcasts[0].readCount).toBe(2);
      expect(payload.data.broadcasts[1].audience).toBe('single-customer');
      expect(payload.data.broadcasts[1].targetUser.name).toBe('Reader One');
    });
  });

  describe('deleteNotification', () => {
    test('deletes notification when found and returns 200', async () => {
      Notification.findByIdAndDelete = jest.fn().mockResolvedValue({ _id: 'notif-1' });

      const req = { params: { id: 'notif-1' }, user: { _id: 'admin-1', role: 'admin' } };
      const res = mockRes();

      deleteNotification(req, res);
      await flush();

      expect(Notification.findByIdAndDelete).toHaveBeenCalledWith('notif-1');
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.message).toBe('Notification removed.');
    });

    test('returns 404 when notification does not exist', async () => {
      Notification.findByIdAndDelete = jest.fn().mockResolvedValue(null);

      const req = { params: { id: 'notif-missing' }, user: { _id: 'admin-1', role: 'admin' } };
      const res = mockRes();

      deleteNotification(req, res);
      await flush();

      expect(Notification.findByIdAndDelete).toHaveBeenCalledWith('notif-missing');
      expect(res.status).toHaveBeenCalledWith(404);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('Notification not found.');
    });
  });
});
