import type { TechIconMapping } from "./types";

// Maps tech keywords (lowercased) to icon files under public/icons/
// Pack paths are as synced from OpenFlowKit assets/third-party-icons/*/processed
// If an icon file is missing, the registry will gracefully skip it.

export const TECH_KEYWORD_MAP: TechIconMapping[] = [
  // Frontend - Onesist stack
  { keywords: ["react", "reactjs", "react 19"], file: "developer/Frontend/reactjs.svg", label: "React" },
  { keywords: ["nextjs", "next.js", "next"], file: "developer/Frontend/nextjs.svg", label: "Next.js" },
  { keywords: ["vite", "vitejs"], file: "developer/Frontend/vitejs.svg", label: "Vite" },
  { keywords: ["tailwind", "tailwindcss"], file: "developer/Frontend/tailwindcss.svg", label: "Tailwind CSS" },
  { keywords: ["typescript", "ts"], file: "developer/Languages/typescript.svg", label: "TypeScript" },
  { keywords: ["javascript", "js"], file: "developer/Languages/javascript.svg", label: "JavaScript" },

  // Backend / Runtime
  { keywords: ["bun", "bunjs"], file: "developer/Backend/bunjs.svg", label: "Bun" },
  { keywords: ["node", "nodejs", "node.js"], file: "developer/Backend/nodejs.svg", label: "Node.js" },
  { keywords: ["tauri", "tauri 2", "desktop"], file: "developer/Languages/rust-light.svg", label: "Tauri" },
  { keywords: ["rust"], file: "developer/Languages/rust-light.svg", label: "Rust" },
  { keywords: ["graphql"], file: "developer/Backend/graphql.svg", label: "GraphQL" },
  { keywords: ["trpc", "tRPC"], file: "developer/Backend/tRPC.svg", label: "tRPC" },
  { keywords: ["zod"], file: "developer/Backend/zod.svg", label: "Zod" },
  { keywords: ["drizzle", "drizzle orm"], file: "developer/Database/postgresql.svg", label: "Drizzle ORM" },

  // Databases
  { keywords: ["postgres", "postgresql", "rds", "aurora"], file: "developer/Database/postgresql.svg", label: "PostgreSQL" },
  { keywords: ["mysql", "mariadb"], file: "developer/Database/mysql.svg", label: "MySQL" },
  { keywords: ["sqlite", "bun sqlite", "better-sqlite"], file: "developer/Database/supabase.svg", label: "SQLite" },
  { keywords: ["redis", "valkey"], file: "developer/Database/redis.svg", label: "Redis" },
  { keywords: ["mongo", "mongodb"], file: "developer/Database/mongodb.svg", label: "MongoDB" },
  { keywords: ["supabase"], file: "developer/Database/supabase.svg", label: "Supabase" },
  { keywords: ["clickhouse"], file: "developer/Database/clickhouse.svg", label: "ClickHouse" },
  { keywords: ["neo4j"], file: "developer/Database/neo4j.svg", label: "Neo4j" },
  { keywords: ["cockroachdb", "cockroach"], file: "developer/Database/cockroachdb.svg", label: "CockroachDB" },

  // Infra / Containers
  { keywords: ["docker"], file: "developer/DevOps-AI-ML/docker.svg", label: "Docker" },
  { keywords: ["kubernetes", "k8s", "k3s"], file: "developer/DevOps-AI-ML/kubernetes.svg", label: "Kubernetes" },
  { keywords: ["nginx"], file: "developer/Infra/nginx.svg", label: "Nginx" },
  { keywords: ["traefik"], file: "developer/Infra/traefik.svg", label: "Traefik" },
  { keywords: ["caddy"], file: "developer/Infra/caddy.svg", label: "Caddy" },
  { keywords: ["consul"], file: "developer/Infra/consul.svg", label: "Consul" },
  { keywords: ["istio"], file: "developer/Infra/istio.svg", label: "Istio" },
  { keywords: ["etcd"], file: "developer/Infra/etcd.svg", label: "etcd" },

  // Message / Queue / Streaming
  { keywords: ["kafka", "msk", "managed streaming"], file: "developer/Backend/kafka.svg", label: "Kafka" },
  { keywords: ["rabbitmq", "mq", "sqs", "sqs queue"], file: "developer/Backend/rabbitmq.svg", label: "RabbitMQ" },
  { keywords: ["eventbridge", "event bridge"], file: "aws/Application-Integration/EventBridge.svg", label: "EventBridge" },
  { keywords: ["sqs", "simple queue"], file: "aws/Application-Integration/Simple-Queue-Service.svg", label: "SQS" },
  { keywords: ["sns", "simple notification"], file: "aws/Application-Integration/Simple-Notification-Service.svg", label: "SNS" },

  // Monitoring / Observability
  { keywords: ["prometheus"], file: "developer/Monitoring/prometheus.svg", label: "Prometheus" },
  { keywords: ["grafana"], file: "developer/Monitoring/grafana.svg", label: "Grafana" },
  { keywords: ["datadog"], file: "developer/Monitoring/datadog.svg", label: "Datadog" },
  { keywords: ["sentry"], file: "developer/Monitoring/sentry.svg", label: "Sentry" },
  { keywords: ["elastic", "elasticsearch", "kibana", "opensearch"], file: "developer/DevOps-AI-ML/elastic.svg", label: "Elastic" },

  // Cloud / AWS (fallback to AWS official icons)
  { keywords: ["aws", "amazon"], file: "developer/DevOps-AI-ML/aws.svg", label: "AWS" },
  { keywords: ["ec2", "compute"], file: "aws/Compute/EC2.svg", label: "EC2" },
  { keywords: ["lambda"], file: "aws/Compute/Lambda.svg", label: "Lambda" },
  { keywords: ["s3", "storage", "bucket"], file: "aws/Storage/S3.svg", label: "S3" },
  { keywords: ["cloudfront", "cdn"], file: "aws/Networking-Content-Delivery/CloudFront.svg", label: "CloudFront" },
  { keywords: ["api gateway", "apigateway"], file: "aws/Networking-Content-Delivery/API-Gateway.svg", label: "API Gateway" },
  { keywords: ["vpc", "virtual private cloud"], file: "aws/Architecture-Group/Virtual-private-cloud-VPC.svg", label: "VPC" },
  { keywords: ["cloud"], file: "aws/Architecture-Group/Cloud.svg", label: "Cloud" },

  // CNCF / Others
  { keywords: ["argocd", "argo cd"], file: "developer/DevOps-AI-ML/argocd.svg", label: "ArgoCD" },
  { keywords: ["github", "git"], file: "developer/DevOps-AI-ML/github-light.svg", label: "GitHub" },
  { keywords: ["cloudflare"], file: "developer/DevOps-AI-ML/cloudflare.svg", label: "Cloudflare" },

  // Generic architecture containers (fallback to AWS group icons)
  { keywords: ["region", "availability zone"], file: "aws/Architecture-Group/Region.svg", label: "Region" },
  { keywords: ["subnet", "private subnet", "public subnet"], file: "aws/Architecture-Group/Public-subnet.svg", label: "Subnet" },
];

/**
 * Find best matching tech icon for a label. Returns the first mapping where any keyword is substring of label.
 */
export function resolveTechIcon(label: string): TechIconMapping | null {
  const lower = label.toLowerCase();
  for (const m of TECH_KEYWORD_MAP) {
    for (const kw of m.keywords) {
      if (lower.includes(kw.toLowerCase())) return m;
    }
  }
  return null;
}
