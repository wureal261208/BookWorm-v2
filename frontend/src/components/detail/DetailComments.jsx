import ContentComments from '../content/ContentComments'

const COMMENT_PREVIEW_LIMIT = 4

function DetailComments({
  account,
  contentId,
  onComment,
}) {
  return (
    <ContentComments
      account={account}
      contentId={contentId}
      onComment={onComment}
    />
  )
}

export { COMMENT_PREVIEW_LIMIT }
export default DetailComments
