require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Content = require('../models/Content');
const Book = require('../models/Book');
const User = require('../models/User');

async function seedBooksFromContent() {
  await connectDB();
  console.log('Connected to MongoDB. Starting sync from Content to Book...');

  // Ensure admin user exists for createdBy
  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    admin = await User.findOne({});
  }
  if (!admin) {
    console.error('No user found to assign createdBy. Creating a system admin user...');
    admin = await User.create({
      name: 'System Admin',
      email: 'admin@bookworm.local',
      role: 'admin',
    });
  }

  const contents = await Content.find({ status: 'published' }).lean();
  console.log(`Found ${contents.length} published items in Content collection.`);

  let insertedCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;

  for (const item of contents) {
    let cleanTitle = (item.title || 'Untitled').trim();
    const cleanAuthor = (item.author || 'Unknown author').trim();

    // Check if title is already taken
    let normalized = cleanTitle.toLowerCase();
    let existing = await Book.findOne({ normalizedTitle: normalized });

    if (existing) {
      if (item.type === 'audiobook' && !cleanTitle.toLowerCase().includes('audiobook')) {
        cleanTitle = `${cleanTitle} (Audiobook)`;
        normalized = cleanTitle.toLowerCase();
        existing = await Book.findOne({ normalizedTitle: normalized });
      }
    }

    if (existing) {
      // Already exists, update views or cover if missing
      existing.views = Math.max(existing.views || 0, item.views || 0, item.downloadCount || 0);
      if (!existing.coverUrl && item.cover_image) {
        existing.coverUrl = item.cover_image;
      }
      await existing.save();
      updatedCount++;
      continue;
    }

    const htmlFile = item.files?.find((f) => f.format === 'html');
    const txtFile = item.files?.find((f) => f.format === 'txt');
    const readerUrl = htmlFile?.url || txtFile?.url || '';

    const etextNumber = item.source === 'Gutenberg' && Number(item.externalId) && Number.isFinite(Number(item.externalId))
      ? Number(item.externalId)
      : null;

    const category = (item.categories && item.categories[0])
      ? item.categories[0]
      : (item.type === 'audiobook' ? 'Audiobook' : 'Classic');

    try {
      await Book.create({
        title: cleanTitle,
        author: cleanAuthor,
        description: item.description || '',
        category,
        coverUrl: item.cover_image || '',
        readerUrl,
        chapters: [],
        status: 'published',
        subjects: item.categories || [],
        language: item.language || 'en',
        createdBy: admin._id,
        createdByRole: 'admin',
        views: item.downloadCount || item.views || 100,
        sourceEtextNumber: etextNumber,
      });
      insertedCount++;
    } catch (err) {
      console.warn(`Could not insert "${cleanTitle}":`, err.message);
      skippedCount++;
    }
  }

  const finalCount = await Book.countDocuments();
  console.log(`Finished seeding! Inserted: ${insertedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}. Total Books now: ${finalCount}`);
  await mongoose.connection.close();
  process.exit(0);
}

seedBooksFromContent().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
