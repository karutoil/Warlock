/**
 * Represents the details of an application.
 *
 * @typedef {Object} AppData
 * @property {string} title Name of the application.
 * @property {string} guid Globally unique identifier of the application.
 * @property {string} icon Icon URL of the application.
 * @property {string} repo Repository URL fragment of the application.
 * @property {string} installer Installer URL fragment of the application.
 * @property {string} source Source handler for the application installer.
 * @property {string} thumbnail Thumbnail URL of the application.
 * @property {HostAppData[]} hosts List of hosts where the application is installed.
 * @property {string} image Full size image URL of the application.
 * @property {string} header Header image URL of the application.
 */

/**
 * Represents the details of a host specifically regarding an installed application.
 *
 * @typedef {Object} HostAppData
 * @property {string} host Hostname or IP of host.
 * @property {string} path Path where the application is installed on the host.
 *
 */

/**
 * Represents the details of a service.
 *
 * @typedef {Object} ServiceData
 * @property {string} name Name of the service, usually operator set for the instance/map name.
 * @property {string} service Service identifier registered in systemd.
 * @property {string} status Current status of the service, one of [running, stopped, starting, stopping].
 * @property {string} cpu_usage Current CPU usage of the service as a percentage or 'N/A'.
 * @property {string} memory_usage Current memory usage of the service in MB/GB or 'N/A'.
 * @property {number} game_pid Process ID of the game server process, or 0 if not running.
 * @property {number} service_pid Process ID of the service manager process, or 0 if not running.
 * @property {string} ip IP address the service is bound to.
 * @property {number} port Port number the service is using.
 * @property {number} player_count Current number of players connected to the service.
 * @property {number} max_players Maximum number of players allowed on the service.
 */

/**
 * Represents a configuration option for a given service or app
 *
 * @typedef {Object} AppConfigOption
 * @property {string} option Name of the configuration option.
 * @property {string|number|bool} value Current value of the configuration option.
 * @property {string|number|bool} default Default value of the configuration option.
 * @property {string} type Data type of the configuration option (str, int, bool, float, text).
 * @property {string} help Help text or description for the configuration option.
 */

const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');
const fs = require('fs');
const yaml = require('js-yaml');
const NodeCacheStore = require('node-cache');
const cache = new NodeCacheStore();

const app = express();
const PORT = process.env.PORT || 3077;

// Load environment variables
require('dotenv').config();


/***************************************************************
 **               Common Functions
 ***************************************************************/

/**
 * Reload the environmental .env file, generally useful after changes are done
 */
const reloadEnv = () => {
    // Re-read .env file to get latest values
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config();
};

/**
 * Get the configured application runner hosts (IP addresses or hostnames)
 *
 * @returns {string[]}
 */
const getSSHHosts = () => {
    let hosts = process.env.HOSTS;
    if (hosts) {
        return hosts.split(',').map(h => h.trim());
    }
    else {
        return []
    }
};

/**
 * Generate an SSH command string to run a remote or local command
 * @param target
 * @param remoteCommand
 * @returns {string}
 */
const buildSSHCommand = (target, remoteCommand) => {
    const hosts = getSSHHosts();
    if (!hosts.includes(target)) {
        throw new Error(`Target host '${target}' is not in the configured HOSTS list.`);
    }

    if (target === 'localhost' || target === '127.0.0.1') {
        return remoteCommand; // No SSH needed for localhost
    }
    else {
        return `ssh root@${target} '${remoteCommand}'`;
    }
};

/**
 * Run a command via SSH on the target host
 *
 * @param target {string}
 * @param cmd {string}
 * @param extraFields {*}
 * @returns {Promise<{stdout: string, stderr: string, extraFields: *}>}
 */
async function cmdRunner(target, cmd, extraFields = {}) {
    return new Promise((resolve, reject) => {
        const sshCommand = buildSSHCommand(target, cmd);

        console.debug('cmdRunner: Executing command on ' + target, sshCommand);
        exec(sshCommand, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('cmdRunner: Received error:', error);
                return reject(error);
            }

            console.debug('cmdRunner:', stdout);
            resolve({ stdout, stderr, extraFields });
        });
    });
}

/**
 * Get all applications from /var/lib/warlock/*.app registration files
 * *
 * @returns {Promise<Object.<string, AppData>>}
 */
async function getAllApplications() {
    return new Promise((resolve, reject) => {
        const hosts = getSSHHosts(),
            appsFilePath = path.join(__dirname, 'Apps.yaml'),
            cmd = 'for file in /var/lib/warlock/*.app; do if [ -f "$file" ]; then echo "$(basename "$file" \'.app\'):$(cat "$file")"; fi; done';
        let applications = {},
            promises = [],
            cachedApplications = cache.get('all_applications');

        if (hosts.length === 0) {
            return reject(new Error('No hosts configured in HOSTS environment variable.'));
        }

        if (cachedApplications) {
            console.debug('getAllApplications: Returning cached application data');
            return resolve(cachedApplications);
        }


        // Open Apps.yaml and parse it for the list of applications
        if (fs.existsSync(appsFilePath)) {
            const fileContents = fs.readFileSync(appsFilePath, 'utf8');
            const data = yaml.load(fileContents);
            if (data) {
                data.forEach(item => {
                    applications[ item.guid ] = item;
                    applications[ item.guid ].hosts = [];
                });

                console.debug('getAllApplications: Application Definitions Loaded', applications);
            }
        }

        hosts.forEach(host => {
            promises.push(cmdRunner(host, cmd));
        });

        Promise.all(promises)
            .then(results => {
                results.forEach((result, index) => {
                    const target = hosts[index];
                    const stdout = result.stdout;

                    for (let line of stdout.split('\n')) {
                        if (line.trim()) {
                            let [guid, path] = line.split(':').map(s => s.trim()),
                                appData = {path: path.trim(), host: target};

                            // Add some data from the local apps definition if it's available
                            if (!applications[guid]) {
                                applications[guid] = {
                                    guid: guid,
                                    title: guid,
                                    description: 'No description available',
                                    hosts: []
                                };
                            }
                            applications[guid]['hosts'].push(appData);
                        }
                    }
                });

                // Cache the applications for 1 hour
                cache.set('all_applications', applications, 3600);
                return resolve(applications);
            });
    });
}

/**
 * Get the details of a single service on a given host
 *
 * @param appData {AppData}
 * @param hostData {HostAppData}
 * @returns {Promise<{services:Object.<{string}, ServiceData>, app:AppData, host:HostAppData}>}
 */
async function getServicesStatus(appData, hostData) {
    return new Promise((resolve, reject) => {

        const guid = appData.guid;

        let cachedServices = cache.get(`services_${guid}_${hostData.host}`);
        if (cachedServices) {
            return resolve({
                app: appData,
                host: hostData,
                services: cachedServices
            });
        }

        cmdRunner(hostData.host, `${hostData.path}/manage.py --get-services`)
            .then(result => {
                const appServices = JSON.parse(result.stdout);

                // Save this to cache for faster future lookups
                cache.set(`services_${guid}_${hostData.host}`, appServices, 10); // Cache for 10 seconds

                return resolve({
                    app: appData,
                    host: hostData,
                    services: appServices
                });
            })
            .catch(error => {
                return reject(new Error(`Error retrieving services for application '${guid}' on host '${hostData.host}': ${error.message}`));
            });
    });
}

/**
 * Get all services from all applications across all hosts
 *
 * @returns {Promise<[{service:ServiceData, app:AppData, host:HostAppData}]>}
 */
async function getAllServices() {
    return new Promise((resolve, reject) => {
        getAllApplications()
            .then(results => {
                let allLookups = [],
                    services = [];

                for (let guid in results) {
                    let app = results[guid];
                    for (let hostData of app.hosts) {
                        allLookups.push(getServicesStatus(app, hostData));
                    }
                }

                Promise.allSettled(allLookups)
                    .then(serviceResults => {
                        serviceResults.forEach(result => {
                            console.debug(result);
                            if (result.status === 'fulfilled') {
                                let appServices = result.value.services;
                                for (let svc of Object.values(appServices)) {
                                    // Merge extra fields into service data
                                    services.push({service: svc, app: result.value.app, host: result.value.host} );
                                }
                            }
                        });

                        resolve(services);
                    });
            })
    });
}

/**
 *
 * @param host
 * @param guid
 * @param service
 * @returns {Promise<Object.<app: AppData, host: HostAppData, service: ServiceData>>}
 */
async function validateHostService(host, guid, service) {
    return new Promise((resolve, reject) => {
        getAllApplications()
            .then(applications => {
                const app = applications[guid] || null;
                let found = false;

                if (!app) {
                    return reject(new Error(`Application with GUID '${guid}' not found`));
                }

                app.hosts.forEach(hostData => {
                    if (hostData.host === host) {
                        found = true;

                        // Check if the service exists on the target host for this application
                        getServicesStatus(app, hostData)
                            .then(serviceResults => {
                                const svc = serviceResults.services[service] || null;

                                if (!svc) {
                                    reject(new Error(`Service '${service}' not found in application '${guid}' on host '${host}'`));
                                }

                                return resolve({
                                    app: app,
                                    host: hostData,
                                    service: svc
                                });
                            })
                            .catch(error => {
                                return reject(new Error(`Error retrieving services for application '${guid}' on host '${host}': ${error.message}`));
                            });
                    }

                    if (!found) {
                        // If the host is not found, we can immediately reject the lookup.
                        return reject(new Error(`Host '${host}' does not have application installed with GUID '${guid}'`));
                    }
                });
            });
    });
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/***************************************************************
 **               Application/UI Endpoints
 ***************************************************************/

// Route to serve the main HTML page (legacy)
app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/service/configure/:guid/:host/:service', (req, res) => {
    validateHostService(req.params.host, req.params.guid, req.params.service)
        .then(() => {
            res.sendFile(path.join(__dirname, 'public', 'service_configure.html'));
        })
        .catch(error => {
            res.status(404).send(`Service configuration not found: ${error.message}`);
        });
});

// Route to serve the new SPA
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to serve navigation component
app.get('/components/nav', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'components', 'nav.html'));
});

// API endpoint to serve page fragments for SPA
app.get('/pages/:page', (req, res) => {
    const page = req.params.page;
    const allowedPages = ['dashboard', 'monitor', 'files', 'settings'];
    
    if (!allowedPages.includes(page)) {
        return res.status(404).send('Page not found');
    }
    
    // Map page names to file names
    const pageFiles = {
        'dashboard': 'index.html',
        'monitor': 'monitor.html',
        'files': 'files.html',
        'settings': 'settings.html'
    };
    
    res.sendFile(path.join(__dirname, 'public', pageFiles[page]));
});

// Monitor page route (legacy)
app.get('/monitor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'monitor.html'));
});

// File browser page route (legacy)
app.get('/files', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'files.html'));
});

// Settings page route (legacy)
app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});


/***************************************************************
 **                      API Endpoints
 ***************************************************************/

/**
 * Get all services and their stats
 *
 * Returns JSON data with success (True/False), output/error, and services {list}
 *
 */
app.get('/api/services', async (req, res) => {
    getAllServices()
        .then((services) => {
            return res.json({
                success: true,
                output: '',
                services: services
            });
        })
        .catch(e => {
            return res.json({
                success: false,
                error: e.message,
                services: []
            });
        });
});

/**
 * Get a single service and its status from a given host and application GUID
 */
app.get('/api/service/:guid/:host/:service', async (req, res) => {
    validateHostService(req.params.host, req.params.guid, req.params.service)
        .then(dat => {
            return res.json({
                success: true,
                service: dat.service
            });
        })
        .catch(e => {
            return res.json({
                success: false,
                error: e.message,
                service: []
            });
        });
});

/**
 * Get the configuration values and settings for a given service
 */
app.get('/api/service/:guid/:host/:service/configs', async (req, res) => {
    validateHostService(req.params.host, req.params.guid, req.params.service)
        .then(dat => {
            cmdRunner(dat.host.host, `${dat.host.path}/manage.py --service ${dat.service.service} --get-configs`)
                .then(result => {
                    return res.json({
                        success: true,
                        configs: JSON.parse(result.stdout)
                    });
                })
                .catch(e => {
                    return res.json({
                        success: false,
                        error: e.message,
                        service: []
                    });
                });
        })
        .catch(e => {
            return res.json({
                success: false,
                error: e.message,
                service: []
            });
        });
});

app.post('/api/service/:guid/:host/:service/configs', async (req, res) => {
    validateHostService(req.params.host, req.params.guid, req.params.service)
        .then(dat => {
            const configUpdates = req.body;
            const updatePromises = [];
            for (let option in configUpdates) {
                const value = configUpdates[option];
                updatePromises.push(
                    cmdRunner(dat.host.host, `${dat.host.path}/manage.py --service ${dat.service.service} --set-config "${option}" "${value}"`)
                );
            }
            Promise.all(updatePromises)
                .then(result => {
                    return res.json({
                        success: true,
                    });
                })
                .catch(e => {
                    return res.json({
                        success: false,
                        error: e.message
                    });
                });
        });
})

/**
 * Get all available applications and which hosts each is installed on
 */
app.get('/api/applications', (req, res) => {
    getAllApplications()
        .then(applications => {
            return res.json({
                success: true,
                applications: applications
            });
        })
        .catch(e => {
            return res.json({
                success: false,
                error: e.message,
                applications: []
            });
        });
});

/**
 * Helper method to facilitate /api/service/[start|stop|restart] endpoints
 *
 * @param action {string}
 * @param req {Request}
 * @param res {Response}
 * @returns {*}
 */
const serviceActionHandler = (action, req, res) => {
    const { guid, host, service } = req.body;

    if (!(host && guid && service && action)) {
        return res.json({
            success: false,
            error: 'Host, service, and action are required'
        });
    }

    const validActions = ['start', 'stop', 'restart'];
    if (!validActions.includes(action)) {
        return res.json({
            success: false,
            error: `Invalid action. Must be one of: ${validActions.join(', ')}`
        });
    }

    validateHostService(host, guid, service)
        .then(dat => {
            cmdRunner(host, `systemctl ${action} ${service}`)
                .then(result => {
                    return res.json({
                        success: true,
                        output: result.stdout,
                        stderr: result.stderr
                    });
                })
                .catch(e => {
                    return res.json({
                        success: false,
                        error: e.message
                    });
                });
        })
        .catch(e => {
            return res.json({
                success: false,
                error: e.message
            });
        });
}
// Service control endpoint (start/stop/restart) - now works with all applications dynamically
app.post('/api/service/start', async (req, res) => {
    serviceActionHandler('start', req, res);
});
app.post('/api/service/stop', async (req, res) => {
    serviceActionHandler('stop', req, res);
});
app.post('/api/service/restart', async (req, res) => {
    serviceActionHandler('restart', req, res);
});

app.get('/service-config', async (req, res) => {
    const { guid, host, service } = req.body;

    if (!(host && guid && service)) {
        return res.json({
            success: false,
            error: 'Host, service, and action are required'
        });
    }

    validateHostService(host, guid, service)
        .then(dat => {
            cmdRunner(host, `${dat.host.path}/manage.py --service ${service} --get-configs`)
                .then(result => {
                    return res.json({
                        success: true,
                        configs: JSON.parse(result.stdout),
                        output: result.stdout,
                        stderr: result.stderr
                    });
                })
                .catch(e => {
                    return res.json({
                        success: false,
                        error: e.message
                    });
                });
        })
        .catch(e => {
            return res.json({
                success: false,
                error: e.message
            });
        });
});

// Legacy endpoint for backward compatibility
app.post('/run-ssh-command', (req, res) => {
    const sshCommand = buildSSHCommand('/home/steam/VEIN/manage.py --help');
    
    console.log('Executing legacy SSH command:', sshCommand);
    
    exec(sshCommand, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('SSH command error:', error);
            return res.json({
                success: false,
                command: sshCommand,
                output: `Error: ${error.message}`,
                stderr: stderr || ''
            });
        }
        
        res.json({
            success: true,
            command: sshCommand,
            output: stdout || 'Command executed successfully (no output)',
            stderr: stderr || ''
        });
    });
});

// Global variable to store htop process
let bpytopProcess = null;
let bpytopOutput = '';

// Start htop monitoring
app.post('/start-bpytop', (req, res) => {
    if (bpytopProcess) {
        return res.json({
            success: true,
            output: 'htop is already running'
        });
    }

    console.log('Starting system monitoring...');
    
    // Start continuous monitoring with system commands that work better for web display
    function updateSystemStats() {
        if (!bpytopProcess) return; // Stop if monitoring was stopped
        
        const monitorCommand = buildSSHCommand(`
echo "=== WARLOCK SYSTEM MONITOR ==="
echo "Timestamp: $(date)"
echo ""
echo "=== CPU INFORMATION ==="
lscpu | grep -E "Model name|CPU MHz|CPU\\(s\\):"
echo ""
echo "=== MEMORY USAGE ==="
free -h
echo ""
echo "=== DISK USAGE ==="
df -h | head -10
echo ""
echo "=== LOAD AVERAGE ==="
uptime
echo ""
echo "=== TOP PROCESSES (CPU) ==="
ps aux --sort=-%cpu | head -10
echo ""
echo "=== TOP PROCESSES (MEMORY) ==="
ps aux --sort=-%mem | head -10
echo ""
echo "=== NETWORK INTERFACES ==="
ip addr show | grep -E "inet |UP|DOWN" | head -10
echo ""
echo "=== ACTIVE CONNECTIONS ==="
ss -tuln | head -10
`);
        
        exec(monitorCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('Monitor command error:', error);
                bpytopOutput = `Error retrieving system stats: ${error.message}\n`;
                return;
            }
            
            bpytopOutput = stdout;
        });
    }
    
    // Mark as running and start periodic updates
    bpytopProcess = { active: true }; // Simple object to track if monitoring is active
    bpytopOutput = 'Initializing system monitoring...\n';
    
    // Update immediately, then every 3 seconds
    updateSystemStats();
    const monitorInterval = setInterval(updateSystemStats, 3000);
    
    // Store interval ID so we can clear it later
    bpytopProcess.intervalId = monitorInterval;
    
    res.json({
        success: true,
        output: 'System monitoring started successfully'
    });
});

// Get current htop output
app.get('/bpytop-output', (req, res) => {
    res.json({
        success: true,
        output: bpytopOutput,
        isRunning: bpytopProcess !== null
    });
});

// Stop system monitoring
app.post('/stop-bpytop', (req, res) => {
    if (bpytopProcess) {
        if (bpytopProcess.intervalId) {
            clearInterval(bpytopProcess.intervalId);
        }
        bpytopProcess = null;
        bpytopOutput = 'System monitoring stopped.\n';
    }
    
    res.json({
        success: true,
        output: 'System monitoring stopped'
    });
});

// File browser endpoints
app.post('/browse-files', (req, res) => {
    const { path: requestedPath } = req.body;
    
    if (!requestedPath) {
        return res.json({
            success: false,
            error: 'Path is required'
        });
    }
    
    console.log('Browsing directory:', requestedPath);
    
    // Use ls with detailed output to get file information
    // -la shows all details including symlinks
    const browseCommand = buildSSHCommand(`ls -la "${requestedPath}" 2>/dev/null | tail -n +2`);
    
    exec(browseCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Browse command error:', error);
            return res.json({
                success: false,
                error: error.message
            });
        }
        
        try {
            const files = [];
            const lines = stdout.trim().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 9) {
                    const permissions = parts[0];
                    const size = parseInt(parts[4]) || 0;
                    
                    // Handle symlinks - they have " -> " in the name
                    const fullNamePart = parts.slice(8).join(' ');
                    let name = fullNamePart;
                    let symlinkTarget = null;
                    let isSymlink = permissions.startsWith('l');
                    
                    if (isSymlink && fullNamePart.includes(' -> ')) {
                        const symlinkParts = fullNamePart.split(' -> ');
                        name = symlinkParts[0];
                        symlinkTarget = symlinkParts[1];
                    }
                    
                    // Skip . and .. entries
                    if (name === '.' || name === '..') continue;
                    
                    // Skip hidden files (starting with .)
                    if (name.startsWith('.')) continue;
                    
                    const isDirectory = permissions.startsWith('d');
                    const fullPath = requestedPath.endsWith('/') ? 
                        `${requestedPath}${name}` : 
                        `${requestedPath}/${name}`;
                    
                    // Determine actual type for symlinks
                    let fileType = 'file';
                    if (isSymlink) {
                        fileType = 'symlink';
                    } else if (isDirectory) {
                        fileType = 'directory';
                    }
                    
                    files.push({
                        name: name,
                        type: fileType,
                        size: isDirectory ? null : size,
                        permissions: permissions,
                        path: fullPath,
                        symlinkTarget: symlinkTarget
                    });
                }
            }
            
            res.json({
                success: true,
                files: files,
                path: requestedPath
            });
            
        } catch (parseError) {
            console.error('Parse error:', parseError);
            res.json({
                success: false,
                error: 'Failed to parse directory listing'
            });
        }
    });
});

// File viewing endpoint
app.post('/view-file', (req, res) => {
    const { path: filePath } = req.body;
    
    if (!filePath) {
        return res.json({
            success: false,
            error: 'File path is required'
        });
    }
    
    console.log('Viewing file:', filePath);
    
    // First check if it's a text file and get its size
    const fileInfoCommand = buildSSHCommand(`file "${filePath}" && stat -c%s "${filePath}" 2>/dev/null`);
    
    exec(fileInfoCommand, (error, stdout, stderr) => {
        if (error) {
            return res.json({
                success: false,
                error: 'Cannot access file'
            });
        }
        
        const lines = stdout.trim().split('\n');
        const fileType = lines[0] || '';
        const fileSize = parseInt(lines[1]) || 0;
        
        // Check if file is too large (limit to 1MB for preview)
        if (fileSize > 1024 * 1024) {
            return res.json({
                success: false,
                error: 'File is too large to preview (>1MB). Use head or tail commands instead.'
            });
        }
        
        // Check if file appears to be binary (but allow text-based script files)
        const isPythonScript = filePath.endsWith('.py') || fileType.includes('Python script') || fileType.includes('python');
        const isTextFile = filePath.endsWith('.txt') || filePath.endsWith('.log') || filePath.endsWith('.conf') || 
                          filePath.endsWith('.json') || filePath.endsWith('.xml') || filePath.endsWith('.yml') || 
                          filePath.endsWith('.yaml') || filePath.endsWith('.sh') || filePath.endsWith('.md') ||
                          fileType.includes('text') || fileType.includes('ASCII');
        
        if (!isPythonScript && !isTextFile && (fileType.includes('binary') || fileType.includes('executable'))) {
            return res.json({
                success: false,
                error: 'Binary files cannot be previewed'
            });
        }
        
        // Read the file content
        const readCommand = buildSSHCommand(`cat "${filePath}" 2>/dev/null`);
        
        exec(readCommand, { maxBuffer: 1024 * 1024 * 2 }, (readError, readStdout, readStderr) => {
            if (readError) {
                return res.json({
                    success: false,
                    error: 'Cannot read file content'
                });
            }
            
            res.json({
                success: true,
                content: readStdout,
                fileType: fileType,
                fileSize: fileSize
            });
        });
    });
});

// Image viewing endpoint - returns base64 encoded image
app.post('/view-image', (req, res) => {
    const { path: filePath } = req.body;
    
    if (!filePath) {
        return res.json({
            success: false,
            error: 'File path is required'
        });
    }
    
    console.log('Viewing image:', filePath);
    
    // Check file size first
    const sizeCommand = buildSSHCommand(`stat -c%s "${filePath}" 2>/dev/null`);
    
    exec(sizeCommand, (error, stdout) => {
        if (error) {
            return res.json({
                success: false,
                error: 'Cannot access image file'
            });
        }
        
        const fileSize = parseInt(stdout.trim()) || 0;
        
        // Limit image/video size to 100MB
        if (fileSize > 100 * 1024 * 1024) {
            return res.json({
                success: false,
                error: 'File is too large to preview (>100MB)'
            });
        }
        
        // Read the image/video as base64
        const readCommand = buildSSHCommand(`base64 "${filePath}" 2>/dev/null`);
        
        exec(readCommand, { maxBuffer: 150 * 1024 * 1024 }, (readError, readStdout) => {
            if (readError) {
                return res.json({
                    success: false,
                    error: 'Cannot read image file'
                });
            }
            
            // Determine mime type from file extension
            const ext = filePath.split('.').pop().toLowerCase();
            const mimeTypes = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'bmp': 'image/bmp',
                'svg': 'image/svg+xml',
                'ico': 'image/x-icon'
            };
            
            const mimeType = mimeTypes[ext] || 'image/jpeg';
            
            res.json({
                success: true,
                image: readStdout.trim(),
                mimeType: mimeType,
                fileSize: fileSize
            });
        });
    });
});

// Enhanced system monitoring endpoint
app.post('/enhanced-monitor', (req, res) => {
    console.log('Getting enhanced system stats...');
    
    const monitorCommand = buildSSHCommand(`
echo "SYSTEM_STATS_START"

echo "CPU_USAGE:"
top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk "{print 100 - \\$1}" | head -1

echo "MEMORY_STATS:"
free | grep "^Mem:" | tr -s " " | cut -d" " -f3,2

echo "STORAGE_STATS:"
df -h / | tail -1 | awk "{print \\$3, \\$4, \\$5}"

echo "LOAD_AVERAGE:"
uptime | awk -F"load average:" "{print \\$2}" | sed "s/^[[:space:]]*//" | sed "s/[[:space:]]*$//"

echo "CPU_INFO:"
nproc

echo "NETWORK_STATS:"
cat /proc/net/dev | grep -v "lo:" | awk "NR>2 {rx+=\\$2; tx+=\\$10} END {print rx, tx}"

echo "CONNECTIONS:"
ss -tuln | wc -l

echo "TOP_CPU_PROCESSES:"
ps aux --sort=-%cpu | head -6 | tail -5 | awk "{print \\$11, \\$3}"

echo "TOP_MEMORY_PROCESSES:"
ps aux --sort=-%mem | head -6 | tail -5 | awk "{print \\$11, \\$4}"

echo "SYSTEM_STATS_END"
`);
    
    exec(monitorCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Enhanced monitor error:', error);
            return res.json({
                success: false,
                error: error.message
            });
        }
        
        try {
            const lines = stdout.trim().split('\n');
            const stats = {};
            let currentSection = '';
            
            lines.forEach(line => {
                line = line.trim();
                if (line.endsWith(':')) {
                    currentSection = line.slice(0, -1);
                    stats[currentSection] = [];
                } else if (line && currentSection) {
                    stats[currentSection].push(line);
                }
            });
            
            res.json({
                success: true,
                stats: stats
            });
        } catch (parseError) {
            console.error('Parse error:', parseError);
            res.json({
                success: false,
                error: 'Failed to parse system stats'
            });
        }
    });
});

// Create folder endpoint
app.post('/create-folder', (req, res) => {
    const { path: folderPath } = req.body;
    
    if (!folderPath) {
        return res.json({
            success: false,
            error: 'Folder path is required'
        });
    }
    
    console.log('Creating folder:', folderPath);
    
    const createCommand = buildSSHCommand(`mkdir -p "${folderPath}" && echo "Folder created successfully"`);
    
    exec(createCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Create folder error:', error);
            return res.json({
                success: false,
                error: `Cannot create folder: ${error.message}`
            });
        }
        
        if (stderr && stderr.trim()) {
            console.error('Create folder stderr:', stderr);
            return res.json({
                success: false,
                error: `Create error: ${stderr.trim()}`
            });
        }
        
        console.log('Folder created successfully:', folderPath);
        res.json({
            success: true,
            message: 'Folder created successfully'
        });
    });
});

// Rename file or folder endpoint
app.post('/rename-item', (req, res) => {
    const { oldPath, newPath, isDirectory } = req.body;
    
    if (!oldPath || !newPath) {
        return res.json({
            success: false,
            error: 'Old path and new path are required'
        });
    }
    
    console.log('Renaming item:', oldPath, '->', newPath);
    
    // Use mv command to rename
    const renameCommand = buildSSHCommand(`mv "${oldPath}" "${newPath}" && echo "Renamed successfully"`);
    
    exec(renameCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Rename error:', error);
            return res.json({
                success: false,
                error: `Cannot rename item: ${error.message}`
            });
        }
        
        if (stderr && stderr.trim()) {
            console.error('Rename stderr:', stderr);
            return res.json({
                success: false,
                error: `Rename error: ${stderr.trim()}`
            });
        }
        
        console.log('Item renamed successfully:', oldPath, '->', newPath);
        res.json({
            success: true,
            message: 'Item renamed successfully'
        });
    });
});

// Delete file or folder endpoint
app.post('/delete-item', (req, res) => {
    const { path: itemPath, isDirectory } = req.body;
    
    if (!itemPath) {
        return res.json({
            success: false,
            error: 'Item path is required'
        });
    }
    
    console.log('Deleting item:', itemPath, 'isDirectory:', isDirectory);
    
    // Use rm -rf for directories, rm for files
    const deleteCommand = isDirectory 
        ? buildSSHCommand(`rm -rf "${itemPath}" && echo "Deleted successfully"`)
        : buildSSHCommand(`rm -f "${itemPath}" && echo "Deleted successfully"`);
    
    exec(deleteCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Delete error:', error);
            return res.json({
                success: false,
                error: `Cannot delete item: ${error.message}`
            });
        }
        
        if (stderr && stderr.trim()) {
            console.error('Delete stderr:', stderr);
            return res.json({
                success: false,
                error: `Delete error: ${stderr.trim()}`
            });
        }
        
        console.log('Item deleted successfully:', itemPath);
        res.json({
            success: true,
            message: isDirectory ? 'Folder deleted successfully' : 'File deleted successfully'
        });
    });
});

// Recursive file search endpoint
app.post('/search-files', (req, res) => {
    const { path, query } = req.body;
    
    if (!path || !query) {
        return res.json({
            success: false,
            error: 'Path and search query are required'
        });
    }
    
    console.log('Searching for:', query, 'in path:', path);
    
    // Use find command to search recursively
    // -iname for case-insensitive search
    // -type f for files, -type d for directories
    // Use both to find files and folders
    // Exclude hidden files with ! -name ".*"
    const searchCommand = buildSSHCommand(`
        cd "${path}" 2>/dev/null || exit 1
        find . -maxdepth 10 \\( -type f -o -type d \\) ! -name ".*" -iname "*${query}*" 2>/dev/null | while read item; do
            fullpath="${path}/\${item#./}"
            if [ -d "$fullpath" ]; then
                echo "DIR|\$fullpath|\$(basename "$fullpath")"
            else
                size=\$(stat -c %s "$fullpath" 2>/dev/null || echo 0)
                echo "FILE|\$fullpath|\$(basename "$fullpath")|\$size"
            fi
        done | head -100
    `);
    
    exec(searchCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Search error:', error);
            return res.json({
                success: false,
                error: `Search failed: ${error.message}`
            });
        }
        
        const results = [];
        const lines = stdout.trim().split('\n').filter(line => line);
        
        lines.forEach(line => {
            const parts = line.split('|');
            if (parts.length >= 3) {
                const type = parts[0] === 'DIR' ? 'directory' : 'file';
                const path = parts[1];
                const name = parts[2];
                const size = parts[3] ? parseInt(parts[3]) : 0;
                
                results.push({
                    type: type,
                    path: path,
                    name: name,
                    size: size,
                    permissions: '-'
                });
            }
        });
        
        console.log(`Found ${results.length} results for "${query}"`);
        res.json({
            success: true,
            results: results,
            count: results.length
        });
    });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '/tmp/');
    },
    filename: (req, file, cb) => {
        cb(null, `warlock_upload_${Date.now()}_${file.originalname}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Upload file endpoint
app.post('/upload-file', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.json({
            success: false,
            error: 'No file uploaded'
        });
    }
    
    const targetPath = req.body.path;
    const targetFile = `${targetPath}/${req.file.originalname}`;
    const tempFile = req.file.path;
    
    console.log('Uploading file:', req.file.originalname, 'to:', targetFile);
    
    // Transfer file to remote server
    const uploadCommand = `scp "${tempFile}" root@45.26.230.248:"${targetFile}" && rm -f "${tempFile}"`;
    
    exec(uploadCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Upload file error:', error);
            // Clean up temp file
            exec(`rm -f "${tempFile}"`, () => {});
            return res.json({
                success: false,
                error: `Cannot upload file: ${error.message}`
            });
        }
        
        console.log('File uploaded successfully:', targetFile);
        res.json({
            success: true,
            message: 'File uploaded successfully'
        });
    });
});

// Save file endpoint
app.post('/save-file', (req, res) => {
    const { path: filePath, content } = req.body;
    
    if (!filePath || content === undefined) {
        return res.json({
            success: false,
            error: 'File path and content are required'
        });
    }
    
    console.log('Saving file:', filePath);
    
    // Create a temporary file on the server with the content and then move it
    const tempFile = `/tmp/warlock_edit_${Date.now()}.tmp`;
    
    // Write content to temp file, then move it to the target location
    const saveCommand = buildSSHCommand(`
        cat > "${tempFile}" << '\''EOF'\''
${content}
EOF
        if [ $? -eq 0 ]; then
            cp "${tempFile}" "${filePath}"
            rm -f "${tempFile}"
            echo "File saved successfully"
        else
            rm -f "${tempFile}"
            echo "Failed to write temporary file"
            exit 1
        fi
    `);
    
    exec(saveCommand, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Save file error:', error);
            return res.json({
                success: false,
                error: `Cannot save file: ${error.message}`
            });
        }
        
        if (stderr && stderr.trim()) {
            console.error('Save file stderr:', stderr);
            return res.json({
                success: false,
                error: `Save error: ${stderr.trim()}`
            });
        }
        
        console.log('File saved successfully:', filePath);
        res.json({
            success: true,
            message: 'File saved successfully'
        });
    });
});

// Settings endpoints
app.get('/get-settings', (req, res) => {
    try {
        const settings = getSSHConfig();
        res.json({
            success: true,
            settings: settings
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.post('/save-settings', (req, res) => {
    const { SSH_USER, SSH_HOST } = req.body;
    
    if (!SSH_USER || !SSH_HOST) {
        return res.json({
            success: false,
            error: 'SSH_USER and SSH_HOST are required'
        });
    }
    
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add SSH_USER
    if (envContent.includes('SSH_USER=')) {
        envContent = envContent.replace(/SSH_USER=.*/g, `SSH_USER=${SSH_USER}`);
    } else {
        envContent += `\nSSH_USER=${SSH_USER}`;
    }
    
    // Update or add SSH_HOST
    if (envContent.includes('SSH_HOST=')) {
        envContent = envContent.replace(/SSH_HOST=.*/g, `SSH_HOST=${SSH_HOST}`);
    } else {
        envContent += `\nSSH_HOST=${SSH_HOST}`;
    }
    
    try {
        fs.writeFileSync(envPath, envContent.trim() + '\n');
        
        // Reload environment variables to pick up the new settings
        delete require.cache[require.resolve('dotenv')];
        require('dotenv').config();
        
        console.log('Settings saved to .env file and reloaded');
        const newConfig = getSSHConfig();
        console.log(`New SSH Configuration: ${newConfig.SSH_USER}@${newConfig.SSH_HOST}`);
        
        res.json({
            success: true,
            message: 'Settings saved successfully'
        });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.json({
            success: false,
            error: `Failed to save settings: ${error.message}`
        });
    }
});

app.post('/test-connection', (req, res) => {
    const { SSH_USER, SSH_HOST } = req.body;
    
    if (!SSH_USER || !SSH_HOST) {
        return res.json({
            success: false,
            error: 'SSH_USER and SSH_HOST are required'
        });
    }
    
    const testCommand = `ssh ${SSH_USER}@${SSH_HOST} 'echo "Connection successful"'`;
    
    exec(testCommand, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Connection test failed:', error);
            return res.json({
                success: false,
                error: `Connection failed: ${error.message}`
            });
        }
        
        if (stdout.includes('Connection successful')) {
            res.json({
                success: true,
                message: 'Connection test successful'
            });
        } else {
            res.json({
                success: false,
                error: 'Unexpected response from server'
            });
        }
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});