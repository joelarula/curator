import { PrismaClient } from '@prisma/client';

export interface MetricPoint {
    time: string;
    count: number;
}

export interface MetricsResult {
    requests: MetricPoint[];
    responses: MetricPoint[];
    stats: {
        totalRequests: number;
        totalResponses: number;
        activeAgents: number;
        failedRequests: number;
    };
}

/**
 * Service to aggregate and provide system metrics.
 */
export class MetricsService {
    constructor(private prisma: PrismaClient) {}

    /**
     * Fetches time-series metrics for the last 60 minutes.
     */
    async getMetrics(): Promise<MetricsResult> {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        // Raw queries for time-series aggregation (PostgreSQL)
        const requestData: any[] = await this.prisma.$queryRaw`
            SELECT date_trunc('minute', "createdAt") as time, count(*)::int as count
            FROM "Request"
            WHERE "createdAt" > ${oneHourAgo}
            GROUP BY time
            ORDER BY time ASC
        `;

        const responseData: any[] = await this.prisma.$queryRaw`
            SELECT date_trunc('minute', "createdAt") as time, count(*)::int as count
            FROM "Response"
            WHERE "createdAt" > ${oneHourAgo}
            GROUP BY time
            ORDER BY time ASC
        `;

        // Summary stats
        const [totalRequests, totalResponses, activeAgents, failedRequests] = await Promise.all([
            this.prisma.request.count(),
            this.prisma.response.count(),
            this.prisma.agent.count({ where: { enabled: true } }),
            this.prisma.request.count({ where: { status: 'FAILED' } })
        ]);

        return {
            requests: requestData.map(d => ({ time: d.time.toISOString(), count: d.count })),
            responses: responseData.map(d => ({ time: d.time.toISOString(), count: d.count })),
            stats: {
                totalRequests,
                totalResponses,
                activeAgents,
                failedRequests
            }
        };
    }

    /**
     * Generates a premium HTML dashboard for visualizing metrics.
     */
    getDashboardHTML(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Curator — System Metrics</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Outfit:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --primary: #a78bfa;
            --secondary: #38bdf8;
            --accent: #f472b6;
            --text: #f1f5f9;
            --text-dim: #94a3b8;
            --border: rgba(255, 255, 255, 0.05);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: var(--bg);
            color: var(--text);
            font-family: 'Inter', sans-serif;
            min-height: 100vh;
            padding: 40px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
        }

        h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 2rem;
            background: linear-gradient(to right, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .status-badge {
            background: rgba(34, 197, 94, 0.2);
            color: #4ade80;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-dot {
            width: 8px; height: 8px;
            background: #4ade80;
            border-radius: 50%;
            box-shadow: 0 0 10px #4ade80;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 24px;
            margin-bottom: 40px;
        }

        .stat-card {
            background: var(--card-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border);
            padding: 24px;
            border-radius: 16px;
            transition: transform 0.2s;
        }

        .stat-card:hover {
            transform: translateY(-4px);
            border-color: rgba(167, 139, 250, 0.3);
        }

        .stat-label {
            color: var(--text-dim);
            font-size: 0.85rem;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .stat-value {
            font-family: 'Outfit', sans-serif;
            font-size: 1.8rem;
            font-weight: 700;
        }

        .chart-container {
            background: var(--card-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border);
            padding: 32px;
            border-radius: 24px;
            margin-bottom: 24px;
        }

        .chart-header {
            margin-bottom: 24px;
        }

        .chart-title {
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .chart-subtitle {
            color: var(--text-dim);
            font-size: 0.9rem;
        }

        canvas {
            width: 100% !important;
            height: 400px !important;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Curator Metrics</h1>
            <div class="status-badge">
                <div class="status-dot"></div>
                Live System Monitoring
            </div>
        </header>

        <div class="stats-grid" id="stats">
            <div class="stat-card">
                <div class="stat-label">Total Requests</div>
                <div class="stat-value" id="val-requests">...</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Responses</div>
                <div class="stat-value" id="val-responses">...</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Active Agents</div>
                <div class="stat-value" id="val-agents">...</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Failed Tasks</div>
                <div class="stat-value" id="val-failed" style="color: #f87171">...</div>
            </div>
        </div>

        <div class="chart-container">
            <div class="chart-header">
                <div class="chart-title">Request & Response Throughput</div>
                <div class="chart-subtitle">Aggregated per minute over the last hour</div>
            </div>
            <canvas id="metricsChart"></canvas>
        </div>
    </div>

    <script>
        let chart;

        async function updateData() {
            try {
                const res = await fetch('/api/metrics');
                const data = await res.json();

                // Update stats
                document.getElementById('val-requests').textContent = data.stats.totalRequests.toLocaleString();
                document.getElementById('val-responses').textContent = data.stats.totalResponses.toLocaleString();
                document.getElementById('val-agents').textContent = data.stats.activeAgents.toLocaleString();
                document.getElementById('val-failed').textContent = data.stats.failedRequests.toLocaleString();

                // Prepare chart data
                const labels = data.requests.map(d => new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                const requestCounts = data.requests.map(d => d.count);
                const responseCounts = data.responses.map(d => d.count);

                if (chart) {
                    chart.data.labels = labels;
                    chart.data.datasets[0].data = requestCounts;
                    chart.data.datasets[1].data = responseCounts;
                    chart.update('none');
                } else {
                    initChart(labels, requestCounts, responseCounts);
                }
            } catch (err) {
                console.error('Failed to fetch metrics:', err);
            }
        }

        function initChart(labels, reqs, resps) {
            const ctx = document.getElementById('metricsChart').getContext('2d');
            
            // Create gradients
            const gradReq = ctx.createLinearGradient(0, 0, 0, 400);
            gradReq.addColorStop(0, 'rgba(167, 139, 250, 0.4)');
            gradReq.addColorStop(1, 'rgba(167, 139, 250, 0)');

            const gradResp = ctx.createLinearGradient(0, 0, 0, 400);
            gradResp.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
            gradResp.addColorStop(1, 'rgba(56, 189, 248, 0)');

            chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Requests',
                            data: reqs,
                            borderColor: '#a78bfa',
                            backgroundColor: gradReq,
                            fill: true,
                            tension: 0.4,
                            borderWidth: 3,
                            pointRadius: 0,
                        },
                        {
                            label: 'Responses',
                            data: resps,
                            borderColor: '#38bdf8',
                            backgroundColor: gradResp,
                            fill: true,
                            tension: 0.4,
                            borderWidth: 3,
                            pointRadius: 0,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'end',
                            labels: {
                                color: '#94a3b8',
                                boxWidth: 12,
                                padding: 20,
                                font: { weight: '600' }
                            }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: '#1e293b',
                            titleColor: '#f1f5f9',
                            bodyColor: '#f1f5f9',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: '#64748b', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
                        },
                        y: {
                            grid: { color: 'rgba(255,255,255,0.03)' },
                            ticks: { color: '#64748b', stepSize: 1 },
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        updateData();
        setInterval(updateData, 10000); // Update every 10s
    </script>
</body>
</html>`;
    }
}
