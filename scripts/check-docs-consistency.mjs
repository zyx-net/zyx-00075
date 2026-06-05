import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')

let errors = 0

function check(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`)
  } else {
    console.log(`  ❌ ${message}`)
    errors++
  }
}

console.log('=== 文档一致性检查 ===')
console.log('')

const serverContent = readFileSync(join(ROOT, 'api/server.ts'), 'utf8')
const viteContent = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')
const workflowContent = readFileSync(join(ROOT, 'api/workflow.ts'), 'utf8')
const typesContent = readFileSync(join(ROOT, 'src/types.ts'), 'utf8')
const readmeContent = readFileSync(join(ROOT, 'README.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

console.log('1. 端口配置检查:')
const serverPortMatch = serverContent.match(/PORT = process\.env\.PORT \|\| (\d+)/)
const serverPort = serverPortMatch ? serverPortMatch[1] : null

const readmePortMatch = readmeContent.match(/http:\/\/localhost:(\d+)/)
const readmePort = readmePortMatch ? readmePortMatch[1] : null

const vitePortMatch = viteContent.match(/target: 'http:\/\/localhost:(\d+)'/)
const vitePort = vitePortMatch ? vitePortMatch[1] : null

check(serverPort === readmePort, `README 端口 (${readmePort}) 与后端端口 (${serverPort}) 一致`)
check(serverPort === vitePort, `Vite 代理端口 (${vitePort}) 与后端端口 (${serverPort}) 一致`)
console.log('')

console.log('2. 状态机定义检查:')
const statusMatch = typesContent.match(/TicketStatus =[^;]+?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?\| '(\w+)'[^;]*?/)
const actualStatuses = statusMatch ? statusMatch.slice(1) : []

const statusStart = readmeContent.indexOf('工单状态')
const apiStart = readmeContent.indexOf('API 接口')
const statusTableContent = statusStart > -1 && apiStart > -1 
  ? readmeContent.slice(statusStart, apiStart) 
  : ''
const readmeStatusRows = statusTableContent.match(/^\| \w+ \| [^|]+ \| [^|]+ \|$/gm) || []
const readmeStatuses = readmeStatusRows
  .map(row => row.match(/^\| (\w+) \|/))
  .filter(m => m && m[1] !== '状态')
  .map(m => m[1])

check(actualStatuses.length === readmeStatuses.length, `状态数量一致 (实际: ${actualStatuses.length}, README: ${readmeStatuses.length})`)

const missingInReadme = actualStatuses.filter(s => !readmeStatuses.includes(s))
const extraInReadme = readmeStatuses.filter(s => !actualStatuses.includes(s))

check(missingInReadme.length === 0, `README 不缺少状态${missingInReadme.length > 0 ? ` (缺少: ${missingInReadme.join(', ')})` : ''}`)
check(extraInReadme.length === 0, `README 不多余状态${extraInReadme.length > 0 ? ` (多余: ${extraInReadme.join(', ')})` : ''}`)
console.log('')

console.log('3. 状态流转规则检查:')
const transitionsMatch = workflowContent.match(/const TRANSITIONS = \{([^}]+?)\}/s)
let actualTransitions = {}
if (transitionsMatch) {
  const lines = transitionsMatch[1].split('\n').filter(l => l.trim())
  for (const line of lines) {
    const m = line.match(/(\w+):\s*\[([^\]]+)\]/)
    if (m) {
      actualTransitions[m[1]] = m[2].replace(/'/g, '').split(',').map(s => s.trim()).filter(s => s)
    }
  }
}

let transitionErrors = 0
for (const [from, to] of Object.entries(actualTransitions)) {
  const rowMatch = readmeContent.match(new RegExp(`\\| ${from} \\| [^|]+ \\| ([^|]+) \\|`))
  if (rowMatch) {
    const readmeTo = rowMatch[1].trim().split(',').map(s => s.trim()).filter(s => s && s !== '-')
    const expected = to.sort().join(', ')
    const actual = readmeTo.sort().join(', ')
    if (expected !== actual) {
      console.log(`  ❌ 状态 ${from} 流转不匹配: 实际=${expected}, README=${actual}`)
      transitionErrors++
    }
  }
}
check(transitionErrors === 0, `状态流转规则一致`)
console.log('')

console.log('4. 启动命令检查:')
check(packageJson.scripts.dev === 'concurrently "npm run client:dev" "npm run server:dev"', 'dev 命令正确')
check(packageJson.scripts['client:dev'] === 'vite', 'client:dev 命令正确')
check(packageJson.scripts['server:dev'] === 'nodemon', 'server:dev 命令正确')
console.log('')

console.log('5. 关键文案检查:')
check(statusTableContent.includes('质检通过') && statusTableContent.includes('quality_passed'), 'README 状态表包含「质检通过」状态')
check(readmeContent.includes('http://localhost:3002'), 'README 使用正确的端口 3002')
check(!readmeContent.includes('http://localhost:3001'), 'README 不包含旧端口 3001')
check(!statusTableContent.includes('待质检') || statusTableContent.includes('质检通过'), '状态流转描述正确')
console.log('')

console.log('=== 检查完成 ===')
console.log('')

if (errors === 0) {
  console.log('✅ 所有检查通过！文档与代码一致。')
  process.exit(0)
} else {
  console.log(`❌ 发现 ${errors} 个不一致问题，请修复后重新检查。`)
  process.exit(1)
}
