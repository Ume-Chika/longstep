import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const targetDirs = [path.join(rootDir, 'src'), path.join(rootDir, 'python')]

function checkDir(dir) {
  let failed = false
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '__pycache__' && checkDir(full)) failed = true
    } else if (entry.isFile() && /\.(ts|tsx|css|py)$/.test(entry.name)) {
      const lines = fs.readFileSync(full, 'utf8').split('\n').length
      if (lines > 200) {
        console.error(`Error: ${full} exceeds 200 lines (${lines} lines)`)
        failed = true
      }
    }
  }
  return failed
}

let hasError = false
for (const dir of targetDirs) {
  if (checkDir(dir)) hasError = true
}

if (hasError) process.exit(1)
console.log('All files in src/ and python/ are 200 lines or fewer.')
