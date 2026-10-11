jest.mock('../models/Story');
jest.mock('../models/Notification');
jest.mock('../models/User');

const Story = require('../models/Story');
const Notification = require('../models/Notification');
const {
  listStories,
  createStory,
  toggleLikeStory,
  getStoryComments,
  addStoryComment,
  deleteStoryComment,
} = require('../controllers/storyController');
const {
  listStoriesForAdmin,
  deleteStoryByAdmin,
} = require('../controllers/adminStoryController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('Story Controllers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('storyController', () => {
    test('listStories returns paginated published stories', async () => {
      const mockStories = [
        {
          _id: 'story-1',
          title: 'My Morning Coffee',
          content: 'A calm morning story',
          authorName: 'Alice',
          tags: ['stories'],
          type: 'story',
          status: 'published',
          likes: ['user-1'],
          views: 10,
          toObject() {
            return this;
          },
        },
      ];

      Story.countDocuments = jest.fn().mockResolvedValue(1);
      const populateMock = jest.fn().mockResolvedValue(mockStories);
      const limitMock = jest.fn().mockReturnValue({ populate: populateMock });
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
      Story.find = jest.fn().mockReturnValue({ sort: sortMock });

      const req = { query: { page: '1', limit: '10' }, user: { _id: 'user-1' } };
      const res = mockRes();

      listStories(req, res);
      await flush();

      expect(Story.countDocuments).toHaveBeenCalledWith({ status: 'published' });
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.stories[0].likesCount).toBe(1);
      expect(payload.data.stories[0].isLiked).toBe(true);
    });

    test('createStory rejects missing title or content', async () => {
      const req = {
        body: { title: '', content: '' },
        user: { _id: 'user-1', name: 'Alice' },
      };
      const res = mockRes();

      createStory(req, res);
      await flush();

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
    });

    test('createStory successfully creates a published story with audio', async () => {
      const createdStory = {
        _id: 'story-2',
        title: 'Story With Voice',
        content: 'Hear my voice recording',
        audioUrl: '/uploads/sample.webm',
        audioDuration: 45,
        type: 'audio-story',
        tags: ['stories'],
        status: 'published',
        likes: [],
        toObject() {
          return this;
        },
      };

      Story.create = jest.fn().mockResolvedValue(createdStory);

      const req = {
        body: {
          title: 'Story With Voice',
          content: 'Hear my voice recording',
          audioUrl: '/uploads/sample.webm',
          audioDuration: 45,
        },
        user: { _id: 'user-1', name: 'Alice' },
      };
      const res = mockRes();

      createStory(req, res);
      await flush();

      expect(Story.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.story.type).toBe('audio-story');
    });

    test('toggleLikeStory adds and removes user like', async () => {
      const storyObj = {
        _id: 'story-1',
        status: 'published',
        likes: [],
        save: jest.fn().mockResolvedValue(true),
      };
      Story.findById = jest.fn().mockResolvedValue(storyObj);

      const req = {
        params: { id: 'story-1' },
        user: { _id: 'user-2' },
      };
      const res = mockRes();

      toggleLikeStory(req, res);
      await flush();

      expect(storyObj.likes).toContain('user-2');
      expect(storyObj.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.data.isLiked).toBe(true);
    });

    test('createStory sanitizes user email into clean author nickname', async () => {
      const createdStory = {
        _id: 'story-nick',
        title: 'Pen Name Story',
        content: 'Written with care',
        authorName: 'Alex River',
        type: 'story',
        tags: ['stories'],
        status: 'published',
        likes: [],
        toObject() {
          return this;
        },
      };

      Story.create = jest.fn().mockImplementation((args) => {
        expect(args.authorName).toBe('Alex River');
        return Promise.resolve(createdStory);
      });

      const req = {
        body: {
          title: 'Pen Name Story',
          content: 'Written with care',
        },
        user: { _id: 'user-nick', name: 'alex.river@domain.com' },
      };
      const res = mockRes();

      createStory(req, res);
      await flush();

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
    });

    test('getStoryComments returns comments with sanitized author nicknames', async () => {
      const storyObj = {
        _id: 'story-1',
        status: 'published',
        comments: [
          {
            _id: 'c-1',
            user: 'user-c',
            authorName: 'charlie.brown@peanuts.org',
            text: 'Love this story!',
            createdAt: new Date(),
          },
        ],
      };
      Story.findById = jest.fn().mockResolvedValue(storyObj);

      const req = { params: { id: 'story-1' } };
      const res = mockRes();

      getStoryComments(req, res);
      await flush();

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.comments[0].authorName).toBe('Charlie Brown');
    });

    test('addStoryComment adds comment with nickname and saves to MongoDB story', async () => {
      const storyObj = {
        _id: 'story-1',
        status: 'published',
        comments: [],
        save: jest.fn().mockResolvedValue(true),
      };
      Story.findById = jest.fn().mockResolvedValue(storyObj);

      const req = {
        params: { id: 'story-1' },
        body: { text: 'Wonderful reading experience!' },
        user: { _id: 'user-commenter', name: 'david.miller@gmail.com', avatar: 'https://avatar.png' },
      };
      const res = mockRes();

      addStoryComment(req, res);
      await flush();

      expect(storyObj.comments.length).toBe(1);
      expect(storyObj.comments[0].authorName).toBe('David Miller');
      expect(storyObj.comments[0].text).toBe('Wonderful reading experience!');
      expect(storyObj.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('deleteStoryComment allows comment author or story author to remove comment', async () => {
      const mockComment = {
        _id: 'c-1',
        user: 'user-commenter',
        deleteOne: jest.fn(),
      };
      const storyObj = {
        _id: 'story-1',
        author: 'story-author-id',
        comments: {
          id: jest.fn().mockReturnValue(mockComment),
          length: 0,
        },
        save: jest.fn().mockResolvedValue(true),
      };
      Story.findById = jest.fn().mockResolvedValue(storyObj);

      const req = {
        params: { id: 'story-1', commentId: 'c-1' },
        user: { _id: 'user-commenter', role: 'customer' },
      };
      const res = mockRes();

      deleteStoryComment(req, res);
      await flush();

      expect(mockComment.deleteOne).toHaveBeenCalled();
      expect(storyObj.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('adminStoryController', () => {
    test('deleteStoryByAdmin removes story and notifies author', async () => {
      const storyToDelete = {
        _id: 'story-bad',
        title: 'Inappropriate Story',
        author: 'author-user-id',
      };
      Story.findById = jest.fn().mockResolvedValue(storyToDelete);
      Story.findByIdAndDelete = jest.fn().mockResolvedValue(storyToDelete);
      Notification.create = jest.fn().mockResolvedValue({ _id: 'notif-1' });

      const req = {
        params: { id: 'story-bad' },
        body: { reason: 'Inappropriate language' },
        user: { _id: 'admin-id' },
      };
      const res = mockRes();

      deleteStoryByAdmin(req, res);
      await flush();

      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUser: 'author-user-id',
          message: expect.stringContaining('Inappropriate language'),
        })
      );
      expect(Story.findByIdAndDelete).toHaveBeenCalledWith('story-bad');
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
    });
  });
});
