terraform {
    required_version = ">= 0.12.29"

    required_providers {
        aws = {
            source  = "hashicorp/aws"
            version = ">= 3.1.0"
        }

        local = {
            source = "hashicorp/local"
            version = ">= 1.4.0"
        }
    }
}


resource "local_file" "function_list" {
    content = jsonencode({
        profile = var.aws_credentials_profile
        functions = var.lambda_functions
        bucket_name = var.bucket_name
        table_name = var.table_name
    })
    filename = "${path.module}/params.json"
}
