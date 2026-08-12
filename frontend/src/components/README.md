# Components Structure

This folder is grouped by feature so developers can find UI code quickly.

- `auth/`: Login and register screens.
- `books/`: Reusable book UI, such as cards and grids.
- `detail/`: Book detail sections, including hero, tabs, chapters, comments, recommendations, and member prompt.
- `layout/`: Shared app layout, navigation, and shell components.
- `pages/`: Full page views, such as Home, Discover, Book Detail, Reader, Profile, and Admin.
- `reader/`: Reader page sections, including topbar, controls, reading frame, chapter strip, comments, and modals.

Most page state and Firebase wiring lives in `../App.jsx`; visual building blocks live here.
