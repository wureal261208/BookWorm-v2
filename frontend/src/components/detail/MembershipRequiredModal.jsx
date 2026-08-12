function MembershipRequiredModal({ id = 'member-required-title', onClose, onLogin }) {
  return (
    <div className="reader-modal-backdrop member-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="reader-modal reader-member-modal">
        <i className="bi bi-stars" />
        <h2 id={id}>You need to be a BookWorm member to keep reading</h2>
        <p>
          Guest readers can preview the first 3 chapters. Log in or register to unlock the rest of this book
          without leaving your place.
        </p>
        <div className="reader-modal-actions">
          <button className="ghost-button" onClick={onClose} type="button">Maybe later</button>
          <button className="primary-button" onClick={onLogin} type="button">
            <i className="bi bi-box-arrow-in-right" />
            Log in to keep reading
          </button>
        </div>
      </div>
    </div>
  )
}

export default MembershipRequiredModal
