# Scripts

Helper scripts for building, testing, and publishing the package.

## Available Scripts

> **Note**: These scripts are for local development. For production use, install from:
> `npm install github:Chronoz99/splat-transform#feature/package-build`

### `setup.sh`

Complete setup script that:
- Installs dependencies
- Builds the package
- Runs tests
- Checks package quality
- Sets up test-app

**Usage:**
```bash
./scripts/setup.sh
```

**When to use:**
- First time setup
- After cloning the repo
- After making major changes

### `test-package.sh`

Full test workflow that:
- Builds the package
- Runs unit tests
- Checks package quality
- Verifies package contents
- Builds test-app

**Usage:**
```bash
./scripts/test-package.sh
```

**When to use:**
- Before publishing
- Before creating a PR
- After making changes
- As part of CI/CD

## Running Scripts

Make sure scripts are executable:

```bash
chmod +x scripts/*.sh
```

Then run them:

```bash
# Full setup
./scripts/setup.sh

# Test everything
./scripts/test-package.sh
```

## Script Output

Scripts use color-coded output:
- 🔵 **Blue**: Current step
- 🟢 **Green**: Success
- 🟡 **Yellow**: Warning/Info

## Adding New Scripts

When adding new scripts:

1. Create the script in `scripts/` directory
2. Make it executable: `chmod +x scripts/your-script.sh`
3. Add error handling: `set -e` at the top
4. Add clear output messages
5. Update this README
6. Test thoroughly

## CI/CD Integration

These scripts are designed to work in CI/CD:

```yaml
# Example GitHub Actions
- name: Setup and test
  run: |
    ./scripts/setup.sh
    ./scripts/test-package.sh
```

## Troubleshooting

### Permission Denied

```bash
chmod +x scripts/*.sh
```

### Script fails midway

Check which step failed and run commands manually:

```bash
# Example: if build fails
npm run build

# Check for errors
npm run lint
```

### Test app fails

```bash
cd test-app
rm -rf node_modules
npm install
npm run dev
```

## Future Scripts (Ideas)

- `bump-version.sh` - Automated version bumping
- `publish.sh` - Publish workflow with checks
- `benchmark.sh` - Run performance benchmarks
- `coverage.sh` - Generate test coverage report
