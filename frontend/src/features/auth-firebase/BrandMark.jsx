// Inline SVG brand mark — crisp at any size/pixel density, unlike a raster
// logo. Used instead of assets/logo.jpg on the auth pages so the mark never
// looks soft or pixelated on high-DPI phone screens.
function BrandMark() {
  return (
    <div className="fa-brand">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M5 3.5C5 2.67 5.67 2 6.5 2h11c.83 0 1.5.67 1.5 1.5v18.02a.5.5 0 0 1-.77.42L12 17.4l-6.23 4.55a.5.5 0 0 1-.77-.42V3.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span>BookWorm</span>
    </div>
  )
}

export default BrandMark
