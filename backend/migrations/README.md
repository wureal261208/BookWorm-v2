# Schema migrations

Do not change a live MongoDB schema by deleting collections. Add a numbered migration here for every data-changing release, run it once in staging, back up production, then run it in production.

Recommended rollout pattern:

1. Add new fields as optional and release code that can read both versions.
2. Run a migration that fills the new fields in batches.
3. Monitor and validate counts/indexes.
4. Make the new fields required only after all documents are migrated.
5. Remove legacy fields/collections in a later release, after a backup and an explicit approval.

`Book` records now use the separate `catalog_books` collection. Existing `books`, `ebooks`, and `audiobooks` collections are intentionally untouched. They are historical data, not evidence that the application reverted to the old schema.
