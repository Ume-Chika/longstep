import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(__dirname, '../src')

function checkDir(dir) {
  let failed = false
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (checkDir(full)) failed = true
    } else if (entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name)) {
      const lines = fs.readFileSync(full, 'utf8').split('\n').length
      if (lines > 200) {
        console.error(`Error: ${full} exceeds 200 lines (${lines} lines)`)
        failed = true
      }
    }
  }
  return failed
}

const failed = checkDir(srcDir)
if (failed) process.exit(1)
console.log('All files in src/ are 200 lines or fewer.')
