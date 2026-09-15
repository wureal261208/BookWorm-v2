// Escapes regex special characters so user-supplied text (a search box, a
// category picker, etc.) can be safely used inside a MongoDB $regex filter
// as a literal substring match, rather than being interpreted as a regex
// pattern itself - without this, something like "C++" or "Vol. 1 (2000)"
// would either throw as invalid regex syntax or match in unintended ways.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = escapeRegExp;
