#!/usr/bin/env node

/**
 * Safe Comment Remover
 * Removes comment-only lines while preserving inline comments and code
 */

const fs = require('fs');
const path = require('path');

// File extensions to process
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Directories to skip
const SKIP_DIRS = ['node_modules', '.next', '.git', 'dist', 'build'];

/**
 * Check if a line is a comment-only line
 */
function isCommentOnlyLine(line) {
  const trimmed = line.trim();
  
  // Empty line
  if (trimmed === '') return false;
  
  // Single-line comment (//)
  if (trimmed.startsWith('//')) return true;
  
  // Multi-line comment start (/*)
  if (trimmed.startsWith('/*')) return true;
  
  // Multi-line comment continuation (*)
  if (trimmed.startsWith('*') && !trimmed.startsWith('*/')) return true;
  
  // Multi-line comment end (*/)
  if (trimmed.startsWith('*/')) return true;
  
  return false;
}

/**
 * Process a file and remove comment-only lines
 */
function processFile(filePath, dryRun = true) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const originalLineCount = lines.length;
    
    let inMultiLineComment = false;
    const newLines = [];
    const removedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Track multi-line comment state
      if (trimmed.includes('/*')) {
        inMultiLineComment = true;
      }
      if (trimmed.includes('*/')) {
        inMultiLineComment = false;
        // Remove the closing comment line if it's comment-only
        if (isCommentOnlyLine(line)) {
          removedLines.push({ line: i + 1, content: line });
          continue;
        }
      }
      
      // Skip if we're inside a multi-line comment
      if (inMultiLineComment) {
        if (isCommentOnlyLine(line)) {
          removedLines.push({ line: i + 1, content: line });
          continue;
        }
      }
      
      // Remove single-line comment-only lines
      if (!inMultiLineComment && isCommentOnlyLine(line)) {
        removedLines.push({ line: i + 1, content: line });
        continue;
      }
      
      // Keep the line
      newLines.push(line);
    }
    
    const newLineCount = newLines.length;
    const removedCount = removedLines.length;
    
    if (removedCount > 0) {
      console.log(`\n📄 ${filePath}`);
      console.log(`   Lines: ${originalLineCount} → ${newLineCount} (removed ${removedCount})`);
      
      if (dryRun && removedLines.length <= 10) {
        console.log('   Removed lines:');
        removedLines.forEach(({ line, content }) => {
          const preview = content.trim().substring(0, 60);
          console.log(`   ${line}: ${preview}${preview.length < content.trim().length ? '...' : ''}`);
        });
      } else if (dryRun) {
        console.log(`   (Showing first 10 of ${removedCount} removed lines)`);
        removedLines.slice(0, 10).forEach(({ line, content }) => {
          const preview = content.trim().substring(0, 60);
          console.log(`   ${line}: ${preview}${preview.length < content.trim().length ? '...' : ''}`);
        });
      }
      
      if (!dryRun) {
        fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
        console.log(`   ✅ Updated`);
      }
    }
    
    return { removedCount, originalLineCount, newLineCount };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Recursively find all files to process
 */
function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.includes(file)) {
        findFiles(filePath, fileList);
      }
    } else {
      const ext = path.extname(file);
      if (EXTENSIONS.includes(ext)) {
        fileList.push(filePath);
      }
    }
  });
  
  return fileList;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const targetDir = args.find(arg => !arg.startsWith('--')) || '.';
  
  console.log('🔍 Safe Comment Remover');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : 'APPLY (will modify files)'}`);
  console.log(`Directory: ${path.resolve(targetDir)}`);
  console.log(`Extensions: ${EXTENSIONS.join(', ')}`);
  console.log('='.repeat(60));
  
  if (!dryRun) {
    console.log('\n⚠️  WARNING: This will modify your files!');
    console.log('Make sure you have committed your changes to git.\n');
  }
  
  const files = findFiles(targetDir);
  console.log(`\nFound ${files.length} files to process...\n`);
  
  let totalRemoved = 0;
  let totalOriginal = 0;
  let filesModified = 0;
  
  files.forEach(file => {
    const result = processFile(file, dryRun);
    if (result) {
      totalRemoved += result.removedCount;
      totalOriginal += result.originalLineCount;
      if (result.removedCount > 0) {
        filesModified++;
      }
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Files processed: ${files.length}`);
  console.log(`   Files with comments removed: ${filesModified}`);
  console.log(`   Total lines removed: ${totalRemoved}`);
  console.log(`   Total original lines: ${totalOriginal}`);
  console.log('='.repeat(60));
  
  if (dryRun) {
    console.log('\n💡 To apply these changes, run:');
    console.log('   node remove-comments.js --apply\n');
  } else {
    console.log('\n✅ All changes applied!\n');
  }
}

// Run the script
main();
