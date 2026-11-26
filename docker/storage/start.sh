#!/bin/sh
set -eu

ACCESS_KEY="${STORAGE_ACCESS_KEY:-cluster-storage}"
SECRET_KEY="${STORAGE_SECRET_KEY:-cluster-storage-secret}"

# No anonymous identity: the bucket is private and files are served by the API (/api/v1/files).
cat > /tmp/s3.json <<EOF
{
  "identities": [
    {
      "name": "cluster-admin",
      "credentials": [
        {
          "accessKey": "${ACCESS_KEY}",
          "secretKey": "${SECRET_KEY}"
        }
      ],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    }
  ]
}
EOF

echo "Starting SeaweedFS server with S3 gateway on port 8333..."
exec weed server -dir=/data -s3 -s3.port=8333 -s3.config=/tmp/s3.json
