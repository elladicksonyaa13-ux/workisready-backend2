import mongoose from 'mongoose';
import User from './models/User.js';
import Task from './models/Task.js';
import Provider from './models/Providers.js';
import SavedTask from './models/SavedTask.js';
import SavedProvider from './models/SavedProvider.js';
import Notification from './models/Notification.js';
import ActivityLog from './models/ActivityLog.js';
import dotenv from 'dotenv';

dotenv.config();

const generateNewUserId = async () => {
  let isUnique = false;
  let customId = '';
  
  while (!isUnique) {
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    customId = `1${randomDigits}`;
    
    const existingUser = await User.findById(customId);
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return customId;
};

const isObjectIdFormat = (id) => {
  // Check if it's a 24-character hex string (ObjectId format)
  const idStr = id.toString();
  return /^[0-9a-fA-F]{24}$/.test(idStr);
};

const migrateUserIds = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📦 Connected to MongoDB');

    // ✅ First, convert any existing ObjectId fields to strings in related collections
    console.log('\n🔄 Converting existing ObjectIds to Strings in related collections...');
    
    // Convert all collections that reference User
    const collections = [
      { name: 'SavedTask', model: SavedTask, field: 'userId' },
      { name: 'SavedProvider', model: SavedProvider, field: 'userId' },
      { name: 'Notification', model: Notification, field: 'userId' },
      { name: 'ActivityLog', model: ActivityLog, field: 'userId' },
      { name: 'Task', model: Task, field: 'clientId' },
      { name: 'Provider', model: Provider, field: 'userId' }
    ];

    for (const col of collections) {
      const result = await col.model.updateMany(
        { [col.field]: { $type: 'objectId' } },
        [{ $set: { [col.field]: { $toString: `$${col.field}` } } }]
      );
      console.log(`   ${col.name}: ${result.modifiedCount} converted`);
    }

    // ✅ Find ALL users
    const allUsers = await User.find({});
    console.log(`\n📊 Total users: ${allUsers.length}`);

    // ✅ Find users that need migration (those with ObjectId format)
    const usersToMigrate = allUsers.filter(user => {
      const idStr = user._id.toString();
      // Need to migrate if it's 24-char hex (ObjectId format) OR not 10 digits starting with 1
      const needsMigration = /^[0-9a-fA-F]{24}$/.test(idStr) || 
                            !(idStr.length === 10 && idStr.startsWith('1'));
      return needsMigration;
    });
    
    console.log(`📊 Users to migrate: ${usersToMigrate.length}`);

    if (usersToMigrate.length === 0) {
      console.log('\n✅ No users need migration. All done!');
      process.exit(0);
    }

    const idMap = new Map();
    let migrated = 0;
    let failed = 0;

    for (const user of usersToMigrate) {
      const oldId = user._id;
      const oldIdStr = oldId.toString();
      
      console.log(`\nProcessing: ${user.email} | Old ID: ${oldIdStr}`);
      
      const newId = await generateNewUserId();
      idMap.set(oldIdStr, newId);

      // Get raw user data
      const rawUser = await User.collection.findOne({ _id: oldId });
      
      if (!rawUser) {
        console.log(`❌ User not found in raw query: ${user.email}`);
        failed++;
        continue;
      }

      // Create new document
      const newUserData = {
        ...rawUser,
        _id: newId,
        userId: newId,
      };
      
      try {
        // Delete old
        await User.collection.deleteOne({ _id: oldId });
        
        // Insert new
        await User.collection.insertOne(newUserData);
        
        migrated++;
        console.log(`✅ Migrated: ${user.email} | Old: ${oldIdStr} -> New: ${newId}`);
      } catch (err) {
        failed++;
        console.error(`❌ Failed to migrate ${user.email}:`, err.message);
        
        // Restore if needed
        const restored = await User.collection.findOne({ _id: oldId });
        if (!restored) {
          await User.collection.insertOne(rawUser);
        }
      }
    }

    console.log('\n📋 Updating references in other collections...');

    // Update all references
    for (const [oldId, newId] of idMap) {
      for (const col of collections) {
        await col.model.updateMany(
          { [col.field]: oldId },
          { $set: { [col.field]: newId } }
        );
      }
    }
    console.log(`✅ Updated all references`);

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migrated} users`);
    console.log(`   ❌ Failed: ${failed} users`);
    console.log('\n✅ Migration completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
};

// Run migration
migrateUserIds();