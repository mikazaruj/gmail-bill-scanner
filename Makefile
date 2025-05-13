# Makefile for Gmail Bill Scanner

# Default target
.PHONY: all
all: clean build

# Clean up old PDF extraction files
.PHONY: clean-pdf
clean-pdf:
	@echo "Backing up and removing old PDF extraction files..."
	@mkdir -p backup/pdf_modules
	@[ -f src/services/pdf/pdfProcessor.ts ] && cp src/services/pdf/pdfProcessor.ts backup/pdf_modules/ && rm -f src/services/pdf/pdfProcessor.ts || echo "pdfProcessor.ts already removed"
	@[ -d src/services/pdf/modules ] && cp -r src/services/pdf/modules backup/pdf_modules/ && rm -rf src/services/pdf/modules || echo "modules directory already removed"
	@echo "Old PDF extraction files backed up and removed"

# Clean up build artifacts
.PHONY: clean
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf dist
	@rm -rf node_modules/.cache
	@echo "Build artifacts cleaned"

# Install dependencies
.PHONY: install
install:
	@echo "Installing dependencies..."
	@npm install

# Build the project
.PHONY: build
build:
	@echo "Building project..."
	@npm run build

# Run tests
.PHONY: test
test:
	@echo "Running tests..."
	@npm test

# Run PDF extraction tests
.PHONY: test-pdf
test-pdf:
	@echo "Running PDF extraction tests..."
	@echo "Note: You need to load the extension and use the 'Test PDF Extraction' button in the debug panel"

# Print help
.PHONY: help
help:
	@echo "Gmail Bill Scanner Makefile"
	@echo ""
	@echo "Available targets:"
	@echo "  all           Clean and build the project (default)"
	@echo "  clean-pdf     Backup and remove old PDF extraction files"
	@echo "  clean         Clean build artifacts"
	@echo "  install       Install dependencies"
	@echo "  build         Build the project"
	@echo "  test          Run tests"
	@echo "  test-pdf      Run PDF extraction tests"
	@echo "  help          Print this help message"
	@echo ""
	@echo "Example usage:"
	@echo "  make clean-pdf       # Remove old PDF extraction files"
	@echo "  make build           # Build the project" 