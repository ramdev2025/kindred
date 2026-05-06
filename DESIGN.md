# Architecture Documentation

This document provides a comprehensive overview of the Vibe Coding Webapp architecture, including system design, data flow, and component interactions.

## Overview

The Vibe Coding Webapp is a full-stack application that enables users to build software applications through natural language descriptions. The system uses intelligent routing to direct requests to appropriate AI models based on task complexity and requirements.

## High-Level Architecture

```text
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   ADK Orchestr   │    │   Hermes Worker │
│   (Next.js)     │◄──►│   (Node.js/TS)   │◄──►│   (FastAPI)     │
│   + Clerk Auth  │    │   + Model Route  │    │   + Local AI    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CDN (GCloud)  │    │   PostgreSQL     │    │   Redis Cache   │
│                 │    │   + Redis Queue  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Component Architecture

### 1. Frontend (Next.js + Clerk)

**Technology Stack:**
- Next.js 14 with App Router
- TypeScript
- Tailwind CSS + shadcn/ui
- Clerk for authentication
- Monaco Editor for code editing
- Axios for API communication

**Key Features:**
- Real-time chat interface
- Live code preview
- Project management
- User authentication
- Responsive design

**Architecture Patterns:**
- Server-side rendering (SSR)
- Client-side state management
- API route handlers
- Middleware for authentication

### 2. ADK Orchestrator (Node.js/TypeScript)

**Technology Stack:**
- Node.js 18+ with TypeScript
- Express.js framework
- Google Agents SDK
- PostgreSQL client
- Redis client
- Bull queue system

**Core Responsibilities:**
- Request routing and orchestration
- Authentication verification
- Model selection logic
- Caching layer management
- Task queue management

**Architecture Patterns:**
- Service-oriented architecture
- Repository pattern for data access
- Strategy pattern for model routing
- Observer pattern for event handling

### 3. Hermes Worker (FastAPI + Python)

**Technology Stack:**
- Python 3.11+
- FastAPI framework
- Transformers library
- PyTorch for ML inference
- Redis for caching
- Async/await patterns

**Core Responsibilities:**
- Deep reasoning tasks
- Local AI model inference
- GPU acceleration
- Response caching
- Streaming responses

**Architecture Patterns:**
- Microservice architecture
- Factory pattern for model loading
- Template method for reasoning workflows
- Proxy pattern for external APIs

### 4. Database Layer (PostgreSQL)

**Schema Design:**
- **Users**: Clerk user synchronization
- **Projects**: User projects and code storage
- **Chat Sessions**: Conversation management
- **Chat Messages**: Individual message storage
- **Agent Configs**: AI model configurations
- **Usage Stats**: Analytics and monitoring

**Design Patterns:**
- Normalized schema design
- Foreign key constraints
- Indexing strategy
- Trigger-based timestamps
- JSONB for flexible metadata

### 5. Cache & Queue Layer (Redis)

**Use Cases:**
- Response caching
- Session storage
- Task queue management
- Rate limiting
- Real-time data

**Data Structures:**
- Strings for simple key-value
- Hashes for structured data
- Lists for queues
- Sets for unique collections
- Sorted sets for rankings

## Data Flow Architecture

### Request Flow

1. **User Request** → Frontend
2. **Authentication** → Clerk JWT verification
3. **API Request** → ADK Orchestrator
4. **Route Analysis** → Model selection logic
5. **AI Processing** → Gemini/GPT/Hermes
6. **Response Caching** → Redis
7. **Data Persistence** → PostgreSQL
8. **Response Delivery** → Frontend

### Model Routing Logic

```typescript
interface RoutingDecision {
  requiresDeepReasoning: boolean;
  preferredModel: 'gemini-2.5-pro' | 'gpt-5.4';
  confidence: number;
  reasoning: string;
}
```

**Routing Algorithm:**
1. **Content Analysis**: NLP-based task classification
2. **Complexity Assessment**: Multi-factor scoring
3. **Resource Availability**: GPU/CPU capacity check
4. **Performance History**: Model success rates
5. **User Preferences**: Custom routing rules

### Caching Strategy

**Multi-Level Caching:**
1. **L1 Cache**: In-memory (application)
2. **L2 Cache**: Redis (distributed)
3. **L3 Cache**: Database (persistent)

**Cache Invalidation:**
- TTL-based expiration
- Manual cache clearing
- Event-driven invalidation
- Version-based cache keys

## Security Architecture

### Authentication & Authorization

**Clerk Integration:**
- JWT-based authentication
- Session management
- User metadata sync
- Role-based access control

**Security Layers:**
1. **Network Level**: SSL/TLS, firewalls
2. **Application Level**: JWT verification, rate limiting
3. **Data Level**: Encryption at rest, access controls
4. **API Level**: Input validation, SQL injection prevention

### Data Protection

**Encryption:**
- Transit: TLS 1.3
- At Rest: AES-256
- Keys: Managed rotation

**Privacy Controls:**
- Data minimization
- User consent management
- GDPR compliance
- Audit logging

## Performance Architecture

### Scalability Design

**Horizontal Scaling:**
- Stateless services
- Load balancing
- Database replication
- Cache clustering

**Vertical Scaling:**
- Resource monitoring
- Auto-scaling policies
- Performance optimization
- Resource allocation

### Performance Optimization

**Frontend:**
- Code splitting
- Lazy loading
- Image optimization
- CDN distribution

**Backend:**
- Connection pooling
- Query optimization
- Caching strategies
- Async processing

**AI Models:**
- Model quantization
- Batch processing
- GPU utilization
- Model caching

## Monitoring & Observability

### Logging Architecture

**Log Levels:**
- ERROR: System failures
- WARN: Performance issues
- INFO: General events
- DEBUG: Detailed tracing

**Log Destinations:**
- Application logs
- System logs
- Audit logs
- Performance logs

### Metrics & Monitoring

**Key Metrics:**
- Response times
- Error rates
- Throughput
- Resource utilization
- Model performance

**Monitoring Tools:**
- Application performance monitoring
- Infrastructure monitoring
- Log aggregation
- Alerting systems

## Deployment Architecture

### Container Strategy

**Multi-stage Builds:**
- Development: Debug tools, hot reload
- Production: Optimized images, security scanning

**Orchestration:**
- Docker Compose for local development
- Kubernetes for production scaling
- Service mesh for advanced networking

### Environment Management

**Environment Types:**
- Development: Local debugging, feature flags
- Staging: Production-like testing
- Production: High availability, monitoring

**Configuration Management:**
- Environment variables
- Secret management
- Configuration validation
- Deployment automation

## Integration Architecture

### External Services

**AI Model APIs:**
- Google Gemini 2.5 Pro
- OpenAI GPT models
- Custom model endpoints

**Authentication:**
- Clerk authentication service
- SSO integration
- User directory sync

**Infrastructure:**
- Google Cloud CDN
- Database hosting
- Monitoring services

### API Design

**RESTful Principles:**
- Resource-based URLs
- HTTP method semantics
- Status code conventions
- Versioning strategy

**GraphQL Considerations:**
- Query optimization
- Schema design
- Resolver patterns
- Caching strategies

## Future Architecture Considerations

### Scalability Enhancements

**Microservices Evolution:**
- Service decomposition
- API gateway implementation
- Service mesh adoption
- Event-driven architecture

**Data Architecture:**
- Read replicas
- Sharding strategies
- NoSQL integration
- Data lake implementation

### AI/ML Enhancements

**Model Management:**
- Model versioning
- A/B testing framework
- Performance monitoring
- Automated retraining

**Advanced Features:**
- Multi-modal AI
- Custom model fine-tuning
- Federated learning
- Edge computing

### Security Enhancements

**Zero Trust Architecture:**
- Identity-based access
- Continuous verification
- Micro-segmentation
- Threat detection

**Compliance Framework:**
- SOC 2 compliance
- ISO 27001 certification
- Privacy by design
- Security assessments

---

This architecture documentation serves as a living document that evolves with the system. Regular updates ensure accuracy and relevance as the Vibe Coding Webapp continues to grow and improve.
