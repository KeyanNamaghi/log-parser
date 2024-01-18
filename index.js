const foo = Bun.file('logs.txt')
const contents = await foo.text()

function formatMilliseconds(milliseconds) {
  const seconds = Math.floor((milliseconds / 1000) % 60)
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60)
  const hours = Math.floor(milliseconds / (1000 * 60 * 60))

  let result = ''

  if (hours > 0) {
    result += `${hours}h `
  }

  if (minutes > 0) {
    result += `${minutes}m `
  }

  if (seconds > 0 || result === '') {
    result += `${seconds}s `
  }

  return result
}

const stages = ['Run yarn install', 'Run yarn lint:js', 'Run yarn lint:scss', 'Run yarn test:unit', 'Run yarn bundlesize', "Run '/etc/arc/hooks/job-completed.sh'"]

const result = contents
  .split('\n')
  .filter((line) => {
    return stages.some((stage) => line.includes(stage))
  })
  .map((line, index, array) => {
    const time = index < array.length - 1 ? new Date(array[index + 1].split(' ')[0]) - new Date(line.split(' ')[0]) : 0
    const humanReadableTime = formatMilliseconds(time)
    const stage = stages.find((stage) => line.includes(stage))

    return { stage: stage.slice(4), time, humanReadableTime }
  })
  .slice(0, -1)

const stagesTotalTime = result.reduce((acc, { time }) => acc + time, 0)
const stagesY = JSON.stringify(result.map(({ time }) => (100 * (time / stagesTotalTime)).toFixed(1)))
const stagesX = JSON.stringify(result.map(({ stage, humanReadableTime }) => `${stage} - ${humanReadableTime}  `))
const stagesRows = result.map((test) => `<tr><td>${test.stage}</td><td>${test.humanReadableTime}</td><td>${((100 * test.time) / stagesTotalTime).toFixed(1) + '%'}</td></tr>`).join('\n')

// console.table doesn't work in bun :(
console.log(result)

const longTests = contents
  .split('\n')
  .filter((line) => {
    return line.match(/PASS .*?\((.*?)\)/)
  })
  .map((line) => {
    const times = line.match(/PASS .*?\/([^\/]*) \(([^ ]*).*\)/)
    return { name: times[1], time: Math.round(times[2]) }
  })
  .sort((a, b) => b.time - a.time)

const xValues = JSON.stringify(longTests.map((test) => test.name))
const yValues = JSON.stringify(longTests.map((test) => test.time))
// This was such a stupid way to do this but I wanted pastel colours
let h = 0.2
const barColors = JSON.stringify(
  longTests.map((_, i) => {
    const golden_ratio_conjugate = 0.618033988749895
    h += golden_ratio_conjugate
    h %= 1
    return `hsl(${Math.floor(360 * h)}deg 80% 85%)`
  }),
)

const totalTime = longTests.reduce((acc, test) => acc + test.time, 0)
const rows = longTests.map((test) => `<tr><td>${test.name}</td><td>${test.time}</td><td>${((100 * test.time) / totalTime).toFixed(1) + '%'}</td></tr>`).join('\n')

const filename = Bun.argv[2] ?? 'report'
const path = Bun.file(`./${filename}.html`)
await Bun.write(
  path,
  `<!DOCTYPE html>
    <html>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.9.4/Chart.js"></script>
    <head><link rel="stylesheet" href="style.css"></head>
    <body>
    <h1>Github Action Report</h1>
        <div style="display: flex; margin-bottom: 30px;">
            <div>
                <canvas id="chart-overall" style="width: 400px;"></canvas>
                <script>
                new Chart('chart-overall', {
                    type: 'pie',
                    data: { labels: ${stagesX}, datasets: [{ backgroundColor: ${barColors}, data: ${stagesY}, hoverBackgroundColor: "#426f6f" } ] },
                    options: { title: { display: true, text: 'code-quality-checks' }, legend: { display: false }, aspectRatio: 1 },
                })
                </script>
            </div>
            <table><tr><th>Test</th><th>Time</th><th>Percentage</th></tr>${stagesRows}</table>
        </div>
        <div style="display: flex;">
            <div>
                <canvas id="chart" style="width: 400px;"></canvas>
                <script>
                new Chart('chart', {
                    type: 'pie',
                    data: { labels: ${xValues}, datasets: [{ backgroundColor: ${barColors}, data: ${yValues}, hoverBackgroundColor: "#426f6f" } ] },
                    options: { title: { display: true, text: 'Slow Tests' }, legend: { display: false }, aspectRatio: 1 },
                })
                </script>
            </div>
            <table><tr><th>Test</th><th>Time (s)</th><th>Percentage</th></tr>${rows}</table>
        </div>
    </body>
    </html>
`,
)
