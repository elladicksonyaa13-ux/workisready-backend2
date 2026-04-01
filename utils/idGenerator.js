import User from '../models/User.js';

/**
 * Generate a unique 10-digit user ID
 * Format: 1 + 9 random digits (10 digits total)
 * Example: 1234567890
 */
export const generateCustomUserId = async () => {
  const prefix = '1'; // Start with 1
  let isUnique = false;
  let customId = '';
  
  while (!isUnique) {
    // Generate 9 random digits (100000000 to 999999999)
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    customId = `${prefix}${randomDigits}`;
    
    // Check if ID already exists
    const existingUser = await User.findById(customId);
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return customId;
};

// /**
//  * Generate sequential 10-digit user ID
//  * Format: 1 + 9 sequential digits
//  * Example: 1000000001, 1000000002, etc.
//  */
// let sequence = 1000000000;
// export const generateSequentialUserId = async () => {
//   let isUnique = false;
//   let customId = '';
  
//   while (!isUnique) {
//     sequence++;
//     customId = sequence.toString();
    
//     const existingUser = await User.findById(customId);
//     if (!existingUser) {
//       isUnique = true;
//     }
//   }
  
//   return customId;
// };

/**
 * Generate timestamp-based 10-digit ID
 * Format: 1 + YYMMDD + 3 random digits
 * Example: 1250331123 (1 + 250331 + 123)
 */
// export const generateTimestampUserId = async () => {
//   const prefix = '1';
//   const date = new Date();
//   const year = date.getFullYear().toString().slice(-2);
//   const month = (date.getMonth() + 1).toString().padStart(2, '0');
//   const day = date.getDate().toString().padStart(2, '0');
//   const dateStr = `${year}${month}${day}`;
//   const randomDigits = Math.floor(100 + Math.random() * 900).toString();
//   let customId = `${prefix}${dateStr}${randomDigits}`;
  
//   // Ensure exactly 10 digits
//   if (customId.length > 10) {
//     customId = customId.slice(0, 10);
//   }
  
//   let isUnique = false;
//   while (!isUnique) {
//     const existingUser = await User.findById(customId);
//     if (!existingUser) {
//       isUnique = true;
//     } else {
//       // If duplicate, regenerate random part
//       const newRandom = Math.floor(100 + Math.random() * 900).toString();
//       customId = `${prefix}${dateStr}${newRandom}`.slice(0, 10);
//     }
//   }
  
//   return customId;
// };