# Configuration
$OutputDir = ".\rmq-cli-app\src\main\resources\META-INF\native-image\io.joaoseidel.rmq\rmq-cli-app"
$JarPath = ".\rmq-cli-app\build\libs\rmq-cli-app-0.1.0-SNAPSHOT-all.jar"
$RabbitUser = "rabbitmq"
$RabbitPass = "rabbitmq"
$RabbitHost = "localhost"
$RabbitHttpPort = "15672"
$RabbitAmqpPort = "5672"

# Define all vhosts to test against
$VHosts = @("/", "teste-one", "teste-two")

# Pre-defined queues per vhost from definitions.json
$DefaultQueues = @{
    "/" = @("test-queue", "test-queue-2", "order-processing", "order-failed", "user-events")
    "teste-one" = @("test-queue", "error-queue")
    "teste-two" = @("test-queue", "notification-queue")
}

# Pre-defined exchanges per vhost from definitions.json
$DefaultExchanges = @{
    "/" = @(("order-exchange", "order.created"), ("user-exchange", "user.created"))
    "teste-one" = @(("error-exchange", ""))
    "teste-two" = @(("notification-exchange", "notification.test"))
}

# Track which operations are supported by which protocol
$AmqpOnlyOperations = @("consume", "cancelConsumer")
$HttpOnlyOperations = @()
$SharedOperations = @("connect", "testConnection", "publishMessage", "getMessages", "purgeQueue", "listQueues", "listVHosts")

Write-Host "===== Building RMQ-CLI JAR =====" -ForegroundColor Green
.\gradlew.bat clean ":rmq-cli-app:shadowJar"

# Create output directory if it doesn't exist
if (-not (Test-Path $OutputDir)) {
    New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null
}

# Remove any leftover lock file from previous runs
$lockFile = Join-Path $OutputDir ".lock"
if (Test-Path $lockFile) {
    Write-Host "Removing leftover lock file..." -ForegroundColor Yellow
    Remove-Item $lockFile -Force
}

Write-Host "===== Running native-image-agent to collect metadata =====" -ForegroundColor Green

# Function to run a command with the agent - with configurable wait times
function Run-WithAgent {
    param (
        [string]$Cmd,
        [int]$WaitAfter = 1,
        [bool]$ExpectFailure = $false
    )
    Write-Host "Running: $Cmd" -ForegroundColor Yellow
    if ($ExpectFailure) {
        Write-Host "Note: This command is expected to fail gracefully" -ForegroundColor Magenta
    }

    # Convert the command string to an array of arguments
    $cmdArgs = $Cmd -split ' '

    java "-agentlib:native-image-agent=config-merge-dir=$OutputDir" -jar $JarPath $cmdArgs
    $exitCode = $LASTEXITCODE

    if ($ExpectFailure -and $exitCode -ne 0) {
        Write-Host "Command failed as expected with exit code: $exitCode" -ForegroundColor Yellow
    } else {
        Write-Host "Exit code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
    }

    Start-Sleep -Seconds $WaitAfter
    Write-Host "-----------------------------------" -ForegroundColor Gray
}

# Fixed function to handle potentially long-running commands
function Run-WithAgentAndTimeout {
    param (
        [string]$Cmd,
        [int]$TimeoutSeconds = 5,
        [bool]$ExpectFailure = $false
    )
    Write-Host "Running with timeout ($TimeoutSeconds s): $Cmd" -ForegroundColor Magenta
    if ($ExpectFailure) {
        Write-Host "Note: This command is expected to fail gracefully" -ForegroundColor Magenta
    }

    try {
        # Create a properly formatted argument list - FIXED
        $agentArg = "-agentlib:native-image-agent=config-merge-dir=$OutputDir"
        $jarArg = "-jar"

        # Use a scriptblock with Start-Job instead of Start-Process
        $job = Start-Job -ScriptBlock {
            param($agent, $jar, $javaPath, $cmdArgs)
            & java $agent $jar $javaPath $cmdArgs.Split(" ")
        } -ArgumentList $agentArg, $jarArg, $JarPath, $Cmd

        # Wait for the job to complete with timeout
        $completed = $job | Wait-Job -Timeout $TimeoutSeconds

        # Check results
        if ($completed -eq $null) {
            Write-Host "Command timed out, stopping job..." -ForegroundColor Yellow
            $job | Stop-Job
            $job | Remove-Job
        } else {
            $result = $job | Receive-Job
            if ($result) {
                Write-Host $result
            }
            $job | Remove-Job
        }
    }
    catch {
        Write-Host "Error running command: $_" -ForegroundColor Red
    }

    # Wait to ensure the process is fully terminated and lock files are released
    Start-Sleep -Seconds 2
    Write-Host "-----------------------------------" -ForegroundColor Gray
}

# Function to get a message ID without using the agent
function Get-MessageId {
    param (
        [string]$QueueName,
        [string]$VHost,
        [string]$SearchTerm = "test",
        [string]$ConnectionName = $null
    )
    Write-Host "Getting message ID from queue $QueueName in vhost $VHost..." -ForegroundColor Yellow

    try {
        # Build command as a proper array of arguments
        $cmdArgs = @("message", "search", $SearchTerm, "--queue", $QueueName, "--vhost", $VHost)
        if ($ConnectionName) {
            $cmdArgs += @("--connection", $ConnectionName)
        }

        # Execute command and capture output
        $output = & java -jar $JarPath $cmdArgs

        # Debug output to see what we're working with
        Write-Host "Command output sample:" -ForegroundColor Gray
        $outputSample = $output | Select-Object -First 10
        if ($outputSample) {
            $outputSample | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
            if ($output.Count -gt 10) {
                Write-Host "  ..." -ForegroundColor Gray
            }
        } else {
            Write-Host "  No output returned" -ForegroundColor Gray
        }

        # Extract the ID using regex
        $messageId = $output |
                    Select-String -Pattern "#([0-9a-f]{40})" |
                    ForEach-Object { $_.Matches.Groups[1].Value } |
                    Select-Object -First 1

        if ($messageId) {
            Write-Host "Found message ID: $messageId" -ForegroundColor Green
        } else {
            Write-Host "No message ID found with standard pattern" -ForegroundColor Yellow

            # Try alternative pattern if needed
            $messageId = $output |
                        Select-String -Pattern "#([0-9a-f]+)" |
                        ForEach-Object { $_.Matches.Groups[1].Value } |
                        Select-Object -First 1

            if ($messageId) {
                Write-Host "Found message ID using alternative pattern: $messageId" -ForegroundColor Green
            }
        }

        Start-Sleep -Seconds 1  # Wait to ensure no process conflicts
        return $messageId
    }
    catch {
        Write-Host "Error extracting message ID: $_" -ForegroundColor Red
        return $null
    }
}

#------------------------------------------
# 1. CONNECTION COMMANDS
#------------------------------------------
Write-Host "===== Testing Connection Commands =====" -ForegroundColor Cyan

# Add a test connection to delete later
Run-WithAgent "connection add delete-conn --host $RabbitHost --username $RabbitUser --password $RabbitPass --vhost / --type amqp"

# Add AMQP connection
Run-WithAgent "connection add local-amqp --host $RabbitHost --username $RabbitUser --password $RabbitPass --vhost / --type amqp --amqp-port $RabbitAmqpPort --http-port $RabbitHttpPort"

# Add HTTP connection
Run-WithAgent "connection add local-http --host $RabbitHost --username $RabbitUser --password $RabbitPass --vhost / --type http --http-port $RabbitHttpPort"

# List connections
Run-WithAgent "connection list"
Run-WithAgent "connection list --verbose"

# Set default connection
Run-WithAgent "connection set-default local-amqp"

# Delete the test connection
Run-WithAgent "connection remove delete-conn --force"

#------------------------------------------
# 2. VHOST COMMANDS
#------------------------------------------
Write-Host "===== Testing VHost Commands =====" -ForegroundColor Cyan

# List vhosts for each connection type
Run-WithAgent "connection vhost list --connection local-amqp"
Run-WithAgent "connection vhost list --connection local-http --verbose"

# Set default vhost for each vhost in the AMQP connection
foreach ($vhost in $VHosts) {
    $vhostForCmd = $vhost
    Run-WithAgent "connection vhost set-default $vhostForCmd --connection local-amqp"
}

# Test the HTTP connection with a couple of vhosts
Run-WithAgent "connection vhost set-default / --connection local-http"
Run-WithAgent "connection vhost set-default teste-one --connection local-http"

#------------------------------------------
# 3. TESTING AMQP-SPECIFIC OPERATIONS
#------------------------------------------
Write-Host "===== Testing AMQP-Specific Operations =====" -ForegroundColor Cyan

# Ensure we're using the AMQP connection
Run-WithAgent "connection set-default local-amqp"

foreach ($vhost in $VHosts) {
    $vhostDisplay = if ($vhost -eq "/") { "default" } else { $vhost }
    Write-Host "Testing AMQP-only operations on vhost $vhostDisplay" -ForegroundColor Green

    # Get test queue for this vhost
    $testQueue = $DefaultQueues[$vhost][0]

    # Test consume operation (AMQP only) - Use Run-WithAgent instead with short wait
    Write-Host "Testing queue consume (AMQP-only operation)" -ForegroundColor Yellow
    Run-WithAgent "queue consume $testQueue --vhost $vhost --count 3 --no-wait" 3
}

#------------------------------------------
# 4. QUEUE AND MESSAGE COMMANDS WITH EXPLICIT VHOST PARAMETER
#------------------------------------------
Write-Host "===== Testing Queue and Message Commands with Explicit Vhost =====" -ForegroundColor Cyan

# Loop through each vhost and test operations
foreach ($vhost in $VHosts) {
    $vhostDisplay = if ($vhost -eq "/") { "default" } else { $vhost }
    Write-Host "Testing commands on vhost $vhostDisplay with AMQP connection" -ForegroundColor Green

    # Ensure we're using the AMQP connection
    Run-WithAgent "connection set-default local-amqp"

    # Get list of queues for this vhost
    $vhostQueues = $DefaultQueues[$vhost]

    #----- QUEUE COMMANDS -----

    # List queues with vhost parameter
    Run-WithAgent "queue list --vhost $vhost"
    Run-WithAgent "queue list --vhost $vhost --verbose"

    # Search queues with vhost parameter
    Run-WithAgent "queue search test* --vhost $vhost"

    # Get first queue from the vhost for other tests
    $testQueue = $vhostQueues[0]

    # Inspect queue with vhost parameter
    Run-WithAgent "queue inspect $testQueue --vhost $vhost"

    # Export queue with vhost parameter
    Run-WithAgent "queue export $testQueue --vhost $vhost --output $vhost-export.json"

    # Purge queue with vhost parameter (use --force to skip confirmation)
    if ($vhostQueues.Count -gt 1) {
        $purgeQueue = $vhostQueues[1]
        Run-WithAgent "queue purge $purgeQueue --vhost $vhost --force" 2
    }

    # Queue requeue operations between two queues in the same vhost - BOTH SAFE AND UNSAFE
    if ($vhostQueues.Count -gt 1) {
        $fromQueue = $vhostQueues[0]
        $toQueue = $vhostQueues[1]

        # Test UNSAFE queue requeue with explicit vhost
        Write-Host "Testing UNSAFE queue requeue operation" -ForegroundColor Yellow
        Run-WithAgent "queue requeue --from $fromQueue --to $toQueue --vhost $vhost --limit 3 --unsafe" 2

        # Test SAFE queue requeue with explicit vhost
        Write-Host "Testing SAFE queue requeue operation" -ForegroundColor Yellow
        Run-WithAgent "queue requeue --from $toQueue --to $fromQueue --vhost $vhost --limit 3" 2

        # Test UNSAFE queue reprocess with explicit vhost
        Write-Host "Testing UNSAFE queue reprocess operation" -ForegroundColor Yellow
        Run-WithAgent "queue reprocess --from $fromQueue --vhost $vhost --limit 2 --unsafe" 2

        # Test SAFE queue reprocess with explicit vhost
        Write-Host "Testing SAFE queue reprocess operation" -ForegroundColor Yellow
        Run-WithAgent "queue reprocess --from $toQueue --vhost $vhost --limit 2" 3

        # Test with --all flag for both variants with explicit vhost
        Run-WithAgent "queue requeue --from $fromQueue --to $toQueue --vhost $vhost --all --unsafe" 2
        Run-WithAgent "queue requeue --from $toQueue --to $fromQueue --vhost $vhost --all" 3
    }

    #----- MESSAGE COMMANDS -----

    # Publishing messages with vhost parameter
    Run-WithAgent "message publish --queue $testQueue --vhost $vhost --payload '{`"test`":`"$vhost-test`"}'"

    # Publish to exchanges specific to this vhost
    if ($DefaultExchanges.ContainsKey($vhost)) {
        foreach ($exchangeInfo in $DefaultExchanges[$vhost]) {
            $exchange = $exchangeInfo[0]
            $routingKey = $exchangeInfo[1]
            Run-WithAgent "message publish --exchange $exchange --routing-key `"$routingKey`" --vhost $vhost --payload '{`"exchange-test`":`"$vhost-$exchange`"}'"
        }
    }

    # Search messages with vhost parameter
    Run-WithAgent "message search test --queue $testQueue --vhost $vhost"

    # Get message ID using our helper function
    $messageId = Get-MessageId -QueueName $testQueue -VHost $vhost

    if ($messageId) {
        Write-Host "Found message ID: $messageId" -ForegroundColor Green

        # Inspect message with vhost parameter
        Run-WithAgent "message inspect $messageId $testQueue --vhost $vhost"

        # Test message operations if we have multiple queues - BOTH SAFE AND UNSAFE
        if ($vhostQueues.Count -gt 1) {
            $fromQueue = $vhostQueues[0]
            $toQueue = $vhostQueues[1]

            # Ensure we have messages in both queues for testing
            Run-WithAgent "message publish --queue $fromQueue --vhost $vhost --payload '{`"safe-test`":`"1`"}'" 1
            Run-WithAgent "message publish --queue $toQueue --vhost $vhost --payload '{`"safe-test`":`"2`"}'" 1

            # Get fresh message IDs for each queue
            $messageIdFromFirst = Get-MessageId -QueueName $fromQueue -VHost $vhost -SearchTerm "safe-test"
            $messageIdFromSecond = Get-MessageId -QueueName $toQueue -VHost $vhost -SearchTerm "safe-test"

            if ($messageIdFromFirst) {
                # Test UNSAFE message requeue with explicit vhost
                Write-Host "Testing UNSAFE message requeue operation" -ForegroundColor Yellow
                Run-WithAgent "message requeue $messageIdFromFirst --from $fromQueue --to $toQueue --vhost $vhost --unsafe" 2
            }

            if ($messageIdFromSecond) {
                # Test SAFE message requeue with explicit vhost
                Write-Host "Testing SAFE message requeue operation" -ForegroundColor Yellow
                Run-WithAgent "message requeue $messageIdFromSecond --from $toQueue --to $fromQueue --vhost $vhost" 3
            }

            # Get fresh message IDs again
            $messageIdFromFirst = Get-MessageId -QueueName $fromQueue -VHost $vhost -SearchTerm "safe-test"
            $messageIdFromSecond = Get-MessageId -QueueName $toQueue -VHost $vhost -SearchTerm "safe-test"

            if ($messageIdFromFirst) {
                # Test UNSAFE message reprocess with explicit vhost
                Write-Host "Testing UNSAFE message reprocess operation" -ForegroundColor Yellow
                Run-WithAgent "message reprocess $messageIdFromFirst --from $fromQueue --vhost $vhost --unsafe" 2
            }

            if ($messageIdFromSecond) {
                # Test SAFE message reprocess with explicit vhost
                Write-Host "Testing SAFE message reprocess operation" -ForegroundColor Yellow
                Run-WithAgent "message reprocess $messageIdFromSecond --from $toQueue --vhost $vhost" 3
            }

            # Test UNSAFE message delete operation with explicit vhost
            $messageIdToDelete = Get-MessageId -QueueName $toQueue -VHost $vhost
            if ($messageIdToDelete) {
                Write-Host "Testing UNSAFE message delete operation" -ForegroundColor Yellow
                Run-WithAgent "message delete $messageIdToDelete $toQueue --vhost $vhost --force" 2
            }

            # Test SAFE message delete operation with explicit vhost
            $messageIdToDelete = Get-MessageId -QueueName $fromQueue -VHost $vhost
            if ($messageIdToDelete) {
                Write-Host "Testing SAFE message delete operation" -ForegroundColor Yellow
                Run-WithAgent "message delete $messageIdToDelete $fromQueue --vhost $vhost" 3
            }
        }
    } else {
        Write-Host "Could not find a message ID in vhost $vhost to test with" -ForegroundColor Yellow
    }
}

#------------------------------------------
# 5. TESTING HTTP CONNECTION WITH SUPPORTED OPERATIONS
#------------------------------------------
Write-Host "===== Testing HTTP Connection with Supported Operations =====" -ForegroundColor Cyan

# Set HTTP connection as default
Run-WithAgent "connection set-default local-http"

foreach ($vhost in $VHosts) {
    $vhostDisplay = if ($vhost -eq "/") { "default" } else { $vhost }
    Write-Host "Testing HTTP-supported operations on vhost $vhostDisplay" -ForegroundColor Green

    # Get test queue for this vhost
    $testQueue = $DefaultQueues[$vhost][0]

    # Test queue operations supported in HTTP
    Run-WithAgent "queue list --vhost $vhost"
    Run-WithAgent "queue search test* --vhost $vhost"
    Run-WithAgent "queue inspect $testQueue --vhost $vhost"

    # Test message operations supported in HTTP
    Run-WithAgent "message publish --queue $testQueue --vhost $vhost --payload '{`"via`":`"http-api`"}'"
    Run-WithAgent "message search via --queue $testQueue --vhost $vhost"
}

#------------------------------------------
# 6. TESTING EXPECTED FAILURES WITH HTTP CONNECTION
#------------------------------------------
Write-Host "===== Testing Expected HTTP Connection Limitations =====" -ForegroundColor Cyan

# Ensure HTTP connection is active
Run-WithAgent "connection set-default local-http"

# Test operations that are known to fail with HTTP
foreach ($vhost in $VHosts) {
    $testQueue = $DefaultQueues[$vhost][0]

    # These operations should fail gracefully with HTTP connection
    Run-WithAgent "queue consume $testQueue --vhost $vhost --ack" 2 $true

    if ($DefaultQueues[$vhost].Count -gt 1) {
        $fromQueue = $DefaultQueues[$vhost][0]
        $toQueue = $DefaultQueues[$vhost][1]

        # These should work normally even with HTTP
        Run-WithAgent "queue requeue --from $fromQueue --to $toQueue --vhost $vhost --limit 3 --unsafe" 2
        Run-WithAgent "queue reprocess --from $fromQueue --vhost $vhost --limit 2 --unsafe" 2
    }
}

#------------------------------------------
# 7. TESTING EXPLICIT CONNECTION PARAMETER WITH VHOST
#------------------------------------------
Write-Host "===== Testing Explicit Connection Parameter with Vhost =====" -ForegroundColor Cyan

# Test AMQP connection with explicit parameters
Run-WithAgent "queue list --connection local-amqp --vhost /"
Run-WithAgent "message publish --connection local-amqp --vhost / --queue test-queue --payload '{`"source`":`"amqp-explicit`"}'"

# Test HTTP connection with explicit parameters
Run-WithAgent "queue list --connection local-http --vhost /"
Run-WithAgent "message publish --connection local-http --vhost / --queue test-queue --payload '{`"source`":`"http-explicit`"}'"

# Test AMQP-only operation with explicit connection (should work)
Run-WithAgent "queue consume test-queue --connection local-amqp --vhost / --count 3 --no-wait" 3

# Test AMQP-only operation with HTTP connection (should fail gracefully)
Run-WithAgent "queue consume test-queue --connection local-http --vhost / --count 3" 2 $true

#------------------------------------------
# 8. TEST ERROR HANDLING PATHS
#------------------------------------------
Write-Host "===== Testing Error Handling Paths =====" -ForegroundColor Cyan

# Test invalid vhost with both connection types
Run-WithAgent "queue list --connection local-amqp --vhost nonexistent-vhost" 1 $true
Run-WithAgent "queue list --connection local-http --vhost nonexistent-vhost" 1 $true

# Test nonexistent queue
Run-WithAgent "queue inspect nonexistent-queue --vhost /" 1 $true

# Test nonexistent message ID
Run-WithAgent "message inspect 123456789abcdef test-queue --vhost /" 1 $true

Write-Host "===== Testing complete =====" -ForegroundColor Green
Write-Host "Native image configuration has been generated in $OutputDir" -ForegroundColor Green

# Clean up test files
Get-ChildItem -Filter "*-export.json" | Remove-Item -ErrorAction SilentlyContinue