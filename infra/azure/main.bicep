param location string = resourceGroup().location
param acrName string
param acrSku string = 'Basic'

param logAnalyticsName string = 'fuchspos-logs'
param containerAppsEnvironmentName string = 'fuchspos-aca-env'

param postgresServerName string
param postgresDbName string = 'fuchspos'
param postgresAdminUser string = 'fuchsposadmin'
@secure()
param postgresAdminPassword string
param postgresVersion string = '16'
param postgresTier string = 'GeneralPurpose'
param postgresCompute string = 'Standard_D2s_v3'
param postgresStorageMb int = 32768

param redisName string
param redisSkuName string = 'Standard'
param redisCapacity int = 1

param keyVaultName string
param keyVaultAdminObjectId string

param backendContainerAppName string = 'fuchspos-backend'
param frontendContainerAppName string = 'fuchspos-frontend'
param backendImage string
param frontendImage string
param backendTargetPort int = 3000
param frontendTargetPort int = 5173
param backendCpu string = '1'
param backendMemory string = '2Gi'
param frontendCpu string = '0.5'
param frontendMemory string = '1Gi'

@secure()
param customerApiKey string
param backendPublicUrl string
param frontendApiUrl string

param databaseSecretName string = 'DATABASE-URL'
param redisSecretName string = 'REDIS-URL'
param backendUrlSecretName string = 'BACKEND-URL'
param frontendApiSecretName string = 'VITE-API-URL'
param customerApiSecretName string = 'CUSTOMER-API-KEY'

var postgresFqdn = '${postgresServerName}.postgres.database.azure.com'
var redisHost = '${redisName}.redis.cache.windows.net'
var databaseUrl = 'postgresql://${postgresAdminUser}:${postgresAdminPassword}@${postgresFqdn}:5432/${postgresDbName}?schema=public&sslmode=require'
var redisUrl = 'rediss://${redisHost}:6380'
var acrCredentials = listCredentials(resourceId('Microsoft.ContainerRegistry/registries', acrName), '2019-05-01')
var backendCpuValue = json(backendCpu)
var frontendCpuValue = json(frontendCpu)

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: acrSku
  }
  properties: {
    adminUserEnabled: true
    policies: {
      exportPolicy: {
        status: 'enabled'
      }
    }
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  sku: {
    name: 'PerGB2018'
  }
  properties: {
    retentionInDays: 30
  }
}

var logAnalyticsKeys = listKeys(logAnalytics.id, '2020-08-01')

resource managedEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalyticsKeys.primarySharedKey
      }
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: postgresCompute
    tier: postgresTier
  }
  properties: {
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    version: postgresVersion
    storage: {
      storageSizeGB: int(postgresStorageMb / 1024)
    }
    highAvailability: {
      mode: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  name: postgresDbName
  parent: postgres
  properties: {}
}

resource redis 'Microsoft.Cache/redis@2023-08-01' = {
  name: redisName
  location: location
  sku: {
    name: redisSkuName
    family: 'C'
    capacity: redisCapacity
  }
  properties: {
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    accessPolicies: []
    publicNetworkAccess: 'Enabled'
  }
  sku: {
    name: 'standard'
    family: 'A'
  }
}

resource kvSecretDatabase 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: databaseSecretName
  parent: keyVault
  properties: {
    value: databaseUrl
  }
}

resource kvSecretRedis 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: redisSecretName
  parent: keyVault
  properties: {
    value: redisUrl
  }
}

resource kvSecretBackendUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: backendUrlSecretName
  parent: keyVault
  properties: {
    value: backendPublicUrl
  }
}

resource kvSecretFrontendApi 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: frontendApiSecretName
  parent: keyVault
  properties: {
    value: frontendApiUrl
  }
}

resource kvSecretCustomerApi 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: customerApiSecretName
  parent: keyVault
  properties: {
    value: customerApiKey
  }
}

resource kvAdminRole 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(keyVault.id, keyVaultAdminObjectId, 'admin')
  scope: keyVault
  properties: {
    principalId: keyVaultAdminObjectId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
    principalType: 'User'
  }
}

resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: backendContainerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: backendTargetPort
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acrCredentials.username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acrCredentials.passwords[0].value
        }
        {
          name: 'database-url'
          identity: 'System'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${databaseSecretName}'
        }
        {
          name: 'redis-url'
          identity: 'System'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${redisSecretName}'
        }
        {
          name: 'backend-url'
          identity: 'System'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${backendUrlSecretName}'
        }
        {
          name: 'customer-api-key'
          identity: 'System'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${customerApiSecretName}'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: backendImage
          resources: {
            cpu: backendCpuValue
            memory: backendMemory
          }
          env: [
            {
              name: 'PORT'
              value: string(backendTargetPort)
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'BACKEND_URL'
              secretRef: 'backend-url'
            }
            {
              name: 'CUSTOMER_API_KEY'
              secretRef: 'customer-api-key'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
      }
    }
  }
}

resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: frontendContainerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: frontendTargetPort
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acrCredentials.username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acrCredentials.passwords[0].value
        }
        {
          name: 'vite-api-url'
          identity: 'System'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${frontendApiSecretName}'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: frontendImage
          resources: {
            cpu: frontendCpuValue
            memory: frontendMemory
          }
          env: [
            {
              name: 'VITE_API_URL'
              secretRef: 'vite-api-url'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

resource backendKvRole 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(keyVault.id, backendApp.name, 'backend-kv')
  scope: keyVault
  properties: {
    principalId: backendApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalType: 'ServicePrincipal'
  }
}

resource frontendKvRole 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(keyVault.id, frontendApp.name, 'frontend-kv')
  scope: keyVault
  properties: {
    principalId: frontendApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalType: 'ServicePrincipal'
  }
}

output registryLoginServer string = acr.properties.loginServer
output backendUrl string = backendPublicUrl
output frontendUrl string = frontendApiUrl
