const COMMENT_PREVIEW_LIMIT = 3

function DetailComments({
  account,
  commentText,
  comments,
  hasMoreComments,
  onCommentText,
  onSubmitComment,
  onToggleComments,
  showAllComments,
  visibleComments,
}) {
  return (
    <section className="section-block comments-section">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Reader voices</p>
          <h2>Comments</h2>
        </div>
        <span>{comments.length} comments</span>
      </div>
      <form
        className="comment-form"
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
            placeholder="Share what you think about this book..."
          />
        </label>
        <button className="primary-button" disabled={!commentText.trim()} type="submit">
          <i className="bi bi-chat-left-text" />
          Post comment
        </button>
      </form>
      {visibleComments.length ? (
        <div className="comment-list">
          {visibleComments.map((comment) => (
            <article className="comment-item" key={comment.id}>
              <div>
                <strong>{comment.author}</strong>
                <span>{comment.role === 'guest' ? 'Guest reader' : 'Member'}</span>
              </div>
              <p>{comment.text}</p>
              <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString()}</time>
            </article>
          ))}
          {hasMoreComments && (
            <button className="ghost-button comment-more-button" onClick={onToggleComments} type="button">
              <i className={`bi ${showAllComments ? 'bi-chevron-up' : 'bi-chat-dots'}`} />
              {showAllComments ? 'Show less' : `View ${comments.length - COMMENT_PREVIEW_LIMIT} more comments`}
            </button>
          )}
        </div>
      ) : (
        <div className="empty-state">No comments yet. Start the conversation.</div>
      )}
    </section>
  )
}

export { COMMENT_PREVIEW_LIMIT }
export default DetailComments
