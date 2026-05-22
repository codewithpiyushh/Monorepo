# DRMS Frontend - Contribution Guidelines

## Code Quality Standards

### Linting
Run ESLint to check for code quality issues:
```bash
npm run lint
```

Fix auto-fixable issues:
```bash
npm run lint:fix
```

### Code Formatting
Run Prettier to format code:
```bash
npm run format
```

Check formatting without changes:
```bash
npm run format:check
```

### Testing
Run all tests:
```bash
npm run test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run tests with coverage:
```bash
npm run test:coverage
```

## Best Practices

1. **Components**: Use functional components with hooks
2. **Styling**: Use Tailwind CSS classes
3. **State Management**: Use Zustand for global state
4. **Data Fetching**: Use React Query with custom hooks
5. **Error Handling**: Always handle errors gracefully with ErrorState component
6. **Loading States**: Use Skeleton components for loading states
7. **Empty States**: Use EmptyState component for empty data
8. **Type Safety**: Add PropTypes or JSDoc comments for component props
9. **Accessibility**: Use semantic HTML and ARIA labels where needed
10. **Performance**: Memoize expensive computations, use lazy loading for routes

## Commit Standards

- Use conventional commits: `type(scope): message`
- Types: feat, fix, docs, style, refactor, test, chore
- Example: `feat(notifications): add mark as read functionality`

## Pull Request Process

1. Create feature branch: `git checkout -b feat/feature-name`
2. Run tests: `npm run test`
3. Run linter: `npm run lint`
4. Format code: `npm run format`
5. Commit with conventional message
6. Push and create PR with description

## File Structure

```
src/
├── api/              # API client and endpoints
├── components/       # Reusable React components
│   └── ui/          # Base UI components
├── pages/           # Page components
├── services/        # Business logic services
├── store/           # Zustand stores
├── utils/           # Utility functions
└── hooks/           # Custom React hooks
```
