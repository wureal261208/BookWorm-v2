function NextChapterModal({ currentChapter, nextChapter, onClose, onContinue }) {
  return (
    <div className="reader-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="next-chapter-title">
      <div className="reader-modal">
        <i className="bi bi-journal-arrow-down" />
        <h2 id="next-chapter-title">Move to the next chapter?</h2>
        <p>
          You just finished {currentChapter.label}. BookWorm can take you to{' '}
          {nextChapter?.label || 'the next chapter'} now.
        </p>
        <div className="reader-modal-actions">
          <button className="ghost-button" onClick={onClose} type="button">Stay here</button>
          <button className="primary-button" onClick={onContinue} type="button">
            <i className="bi bi-arrow-right" />
            Read next chapter
          </button>
        </div>
      </div>
    </div>
  )
}

function ReaderMemberModal({ onClose, onLoginRequired }) {
  return (
    <div className="reader-modal-backdrop member-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="member-required-title">
      <div className="reader-modal reader-member-modal">
        <i className="bi bi-stars" />
        <h2 id="member-required-title">You need to be a BookWorm member to keep reading</h2>
        <p>
          The next chapters are reserved for members. Log in or register to unlock the full story,
          continue from this exact chapter, and keep your reading history.
        </p>
        <div className="reader-modal-actions">
          <button className="ghost-button" onClick={onClose} type="button">Maybe later</button>
          <button className="primary-button" onClick={onLoginRequired} type="button">
            <i className="bi bi-box-arrow-in-right" />
            Log in to keep reading
          </button>
        </div>
      </div>
    </div>
  )
}

export { NextChapterModal, ReaderMemberModal }
