locals {
    csharp_package_path     = "./csharp/DotnetLambdaBenchmark/src/DotnetLambdaBenchmark/bin/Release/netcoreapp3.1/DotnetLambdaBenchmark.zip"
    go_package_path         = "./go/package.zip"
    java_package_path       = "./java/build/distributions/javatest-1.0-SNAPSHOT.zip"
    python_package_path     = "./python/package.zip"
    typescript_package_path = "./typescript/package.zip"

    environment_variables = {
        TABLE_NAME = aws_dynamodb_table.test_permissions.name
        // The bucket that will be serviced
        BUCKET_NAME = aws_s3_bucket.test_data.id
    }

    function_timeout = 10 // Seconds
    log_retention_days = 3
}

module "csharp" {
    source = "./lambda_deployment"

    function_name = "csharp-benchmark"
    deployment_package_path = local.csharp_package_path
    function_description = "Benchmarks the cold start of AWS Lambda function using the .NET runtime."

    deployment_bucket = aws_s3_bucket.deployment_packages.id
    deployment_package_key = "csharp.zip"

    // Assembly::Namespace.Class::Method
    // If not specified in the buildOptions.outputName in csproj, then the AssemblyName is the name of the containing folder
    handler = "DotnetLambdaBenchmark::DotnetLambdaBenchmark.Function::FunctionHandler"
    runtime = "dotnetcore3.1"

    environment_variables = local.environment_variables

    function_timeout = local.function_timeout

    log_retention_days = local.log_retention_days
    policies_arn = [aws_iam_policy.benchmark_permissions.arn]
}

module "go" {
    source = "./lambda_deployment"

    function_name = "go-benchmark"
    deployment_package_path = local.go_package_path
    function_description = "Benchmarks the cold start of AWS Lambda function using the Go runtime."

    deployment_bucket = aws_s3_bucket.deployment_packages.id
    deployment_package_key = "go.zip"

    handler = "main"
    runtime = "go1.x"

    environment_variables = local.environment_variables

    function_timeout = local.function_timeout

    log_retention_days = local.log_retention_days
    policies_arn = [aws_iam_policy.benchmark_permissions.arn]
}

module "java" {
    source = "./lambda_deployment"

    function_name = "java-benchmark"
    deployment_package_path = local.java_package_path
    function_description = "Benchmarks the cold start of AWS Lambda function using the Java runtime."

    deployment_bucket = aws_s3_bucket.deployment_packages.id
    deployment_package_key = "java.zip"

    handler = "benchmark.Handler::handleRequest"
    runtime = "java11"
    memory_size = 256

    environment_variables = local.environment_variables

    function_timeout = 30

    log_retention_days = local.log_retention_days
    policies_arn = [aws_iam_policy.benchmark_permissions.arn]
}

module "python" {
    source = "./lambda_deployment"

    function_name = "python-benchmark"
    deployment_package_path = local.python_package_path
    function_description = "Benchmarks the cold start of AWS Lambda function using the Python runtime."

    deployment_bucket = aws_s3_bucket.deployment_packages.id
    deployment_package_key = "python.zip"

    handler = "main.handle"
    runtime = "python3.8"

    environment_variables = local.environment_variables

    function_timeout = local.function_timeout

    log_retention_days = local.log_retention_days
    policies_arn = [aws_iam_policy.benchmark_permissions.arn]
}

module "typescript" {
    source = "./lambda_deployment"

    function_name = "typescript-benchmark"
    deployment_package_path = local.typescript_package_path
    function_description = "Benchmarks the cold start of AWS Lambda function using the Node.js runtime."

    deployment_bucket = aws_s3_bucket.deployment_packages.id
    deployment_package_key = "typescript.zip"

    handler = "handler.handler"
    runtime = "nodejs12.x"

    environment_variables = local.environment_variables

    function_timeout = local.function_timeout

    log_retention_days = local.log_retention_days
    policies_arn = [aws_iam_policy.benchmark_permissions.arn]
}