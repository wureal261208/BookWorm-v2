const { success, fail } = require('../utils/response');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('utils/response', () => {
  test('success() sets the status code and a success:true envelope', () => {
    const res = mockRes();
    success(res, 201, 'Book pushed successfully.', { id: 'abc123' });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Book pushed successfully.',
      data: { id: 'abc123' },
    });
  });

  test('success() defaults data to null when omitted', () => {
    const res = mockRes();
    success(res, 200, 'OK');

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'OK',
      data: null,
    });
  });

  test('fail() sets the status code and a success:false envelope with null data', () => {
    const res = mockRes();
    fail(res, 404, 'Book not found.');

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Book not found.',
      data: null,
    });
  });
});
