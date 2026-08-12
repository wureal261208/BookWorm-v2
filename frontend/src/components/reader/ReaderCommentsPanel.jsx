function ReaderCommentsPanel({
  account,
  commentText,
  comments,
  totalComments,
  onCommentText,
  onSubmitComment,
}) {
  return (
    <aside className="reader-comments-panel">
      <div className="reader-comments-heading">
        <div>
          <p className="mono-eyebrow">Reader voices</p>
          <h2>Comments</h2>
        </div>
        <span>{totalComments}</span>
      </div>
      <form
        className="reader-comment-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmitComment()
        }}
      >
        <label>
          {account?.role === 'guest' ? 'Comment as guest' : `Comment as ${account.name}`}
          <textarea
            value={commentText}
            onChange={(event) => onCommentText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmitComment()
              }
            }}
            placeholder="Share a thought from this chapter..."
          />
        </label>
        <button className="primary-button" disabled={!commentText.trim()} type="submit">
          <i className="bi bi-chat-left-text" />
          Post comment
        </button>
      </form>
      <div className="reader-comment-list">
        {comments.length ? (
          comments.map((comment) => (
            <article className="reader-comment-item" key={comment.id}>
              <div>
                <strong>{comment.author}</strong>
                <span>{comment.role === 'guest' ? 'Guest reader' : 'Member'}</span>
              </div>
              <p>{comment.text}</p>
              <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString()}</time>
            </article>
          ))
        ) : (
          <div className="reader-empty-comments">No comments yet.</div>
        )}
      </div>
    </aside>
  )
}

export default ReaderCommentsPanel
