import { useEffect, useMemo, useState } from 'react';
import Select, { components } from 'react-select';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3026';
const API_PREFIX = '/api';
const AUTH_TOKEN_KEY = 'dem_auth_token';
const ACTIVE_MENU_KEY = 'dem_active_menu';
const DASHBOARD_REFRESH_INTERVAL_KEY = 'dem_dashboard_refresh_interval';
const RESULTS_USERS_FILTER_KEY = 'dem_results_users_filter';
const RESULTS_VERIFICATIONS_FILTER_KEY = 'dem_results_verifications_filter';
const MENU_ITEMS = [
  {
    id: 'dashboard',
    icon: 'dashboard',
    label: 'Dashboard',
    title: 'Página Dashboard',
    message: 'Resumo geral em construção.',
  },
  {
    id: 'users',
    icon: 'monitoring',
    label: 'Painel de Status',
    title: 'Página Painel de Status',
    message: 'Área de status em construção.',
  },
  {
    id: 'checks',
    icon: 'fact_check',
    label: 'Regras',
    title: 'Página Regras',
    message: 'Painel de regras em construção.',
  },
  {
    id: 'devices',
    icon: 'devices',
    label: 'Dispositivos',
    title: 'Página Dispositivos',
    message: 'Lista de dispositivos em construção.',
  },
  {
    id: 'accounts',
    icon: 'manage_accounts',
    label: 'Usuários',
    title: 'Página Usuários',
    message: 'Gestão de usuários em construção.',
  },
  {
    id: 'settings',
    icon: 'settings',
    label: 'Configurações',
    title: 'Página Configurações',
    message: 'Configurações do sistema em construção.',
  },
];

const EMPTY_VERIFICATION_FORM = {
  name: '',
  description: '',
  active: true,
  command: '',
  validationType: 'exact',
  validationValue: '',
};

const EMPTY_DASHBOARD_METRICS = {
  usersCount: 0,
  activeVerificationsCount: 0,
  errorCount: 0,
  notExecutedCount: 0,
  okCount: 0,
  pendingUsersRanking: [],
  staleUsersRanking: [],
};

const DASHBOARD_AUTO_REFRESH_OPTIONS = [10, 30, 60];
const DEFAULT_DASHBOARD_AUTO_REFRESH_SECONDS = 60;

function formatElapsedFromTimestamp(timestamp) {
  if (!timestamp || Number.isNaN(timestamp)) {
    return 'sem comunicação';
  }

  const elapsedMs = Math.max(Date.now() - timestamp, 0);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);

  if (elapsedMinutes < 1) {
    return '< 1 min';
  }

  const days = Math.floor(elapsedMinutes / 1440);
  const hours = Math.floor((elapsedMinutes % 1440) / 60);
  const minutes = elapsedMinutes % 60;
  const parts = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 && days === 0) {
    parts.push(`${minutes}min`);
  }

  return parts.join(' ');
}

function formatDateTime(dateString) {
  if (!dateString) {
    return 'nunca';
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return 'data inválida';
  }

  return parsed.toLocaleString('pt-BR');
}

function normalizeDisplayValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function getPreferredDisplayName(row, aliasByMachineId = new Map()) {
  const providedPreferredName = normalizeDisplayValue(row?.preferredName);
  const machineId = normalizeDisplayValue(row?.machineId);
  const alias = normalizeDisplayValue(aliasByMachineId.get(machineId));
  const username = normalizeDisplayValue(row?.username);
  const machineName = normalizeDisplayValue(row?.machineName);

  return providedPreferredName || alias || username || machineName || machineId || '-';
}

function buildAliasMap(devicesPayload) {
  const aliasByMachineId = new Map();

  for (const device of devicesPayload) {
    const machineId = normalizeDisplayValue(device?.machineId);
    const alias = normalizeDisplayValue(device?.alias);

    if (machineId && alias) {
      aliasByMachineId.set(machineId, alias);
    }
  }

  return aliasByMachineId;
}

const clickableMultiValueComponents = {
  MultiValue: (props) => {
    const { removeProps } = props;

    return (
      <components.MultiValue
        {...props}
        innerProps={{
          ...props.innerProps,
          onMouseDown: (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeProps.onClick();
          },
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeProps.onClick();
          },
          title: 'Clique para remover',
        }}
      />
    );
  },
};

export default function App() {
  const [authView, setAuthView] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [authToken, setAuthToken] = useState(null);
  const [loggedUser, setLoggedUser] = useState('');
  const [loggedUserRole, setLoggedUserRole] = useState('NORMAL');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [verifications, setVerifications] = useState([]);
  const [isLoadingVerifications, setIsLoadingVerifications] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [isVerificationFormOpen, setIsVerificationFormOpen] = useState(false);
  const [isSavingVerification, setIsSavingVerification] = useState(false);
  const [editingVerificationId, setEditingVerificationId] = useState(null);
  const [verificationForm, setVerificationForm] = useState(EMPTY_VERIFICATION_FORM);
  const [verificationToDelete, setVerificationToDelete] = useState(null);
  const [isDeletingVerification, setIsDeletingVerification] = useState(false);
  const [resultsMode, setResultsMode] = useState('by-user');
  const [resultsData, setResultsData] = useState([]);
  const [activeVerifications, setActiveVerifications] = useState([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState('');
  const [selectedUsersFilter, setSelectedUsersFilter] = useState([]);
  const [selectedVerificationsFilter, setSelectedVerificationsFilter] = useState([]);
  const [selectedStatusUser, setSelectedStatusUser] = useState(null);
  const [selectedStatusVerification, setSelectedStatusVerification] = useState(null);
  const [devicesData, setDevicesData] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [devicesError, setDevicesError] = useState('');
  const [deviceToEditAlias, setDeviceToEditAlias] = useState(null);
  const [deviceAliasInput, setDeviceAliasInput] = useState('');
  const [isSavingDeviceAlias, setIsSavingDeviceAlias] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('');
  const [usersManagementData, setUsersManagementData] = useState([]);
  const [isLoadingUsersManagement, setIsLoadingUsersManagement] = useState(false);
  const [usersManagementError, setUsersManagementError] = useState('');
  const [isUpdatingUserRole, setIsUpdatingUserRole] = useState(false);
  const [dashboardMetrics, setDashboardMetrics] = useState(EMPTY_DASHBOARD_METRICS);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardRefreshIntervalSeconds, setDashboardRefreshIntervalSeconds] = useState(
    DEFAULT_DASHBOARD_AUTO_REFRESH_SECONDS,
  );
  const [dashboardRefreshCountdown, setDashboardRefreshCountdown] = useState(
    DEFAULT_DASHBOARD_AUTO_REFRESH_SECONDS,
  );

  const isLoggedIn = useMemo(() => Boolean(authToken), [authToken]);

  useEffect(() => {
    async function restoreSession() {
      const storedToken = sessionStorage.getItem(AUTH_TOKEN_KEY);

      if (!storedToken) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const response = await fetch(getApiUrl('/auth/me'), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.username) {
          sessionStorage.removeItem(AUTH_TOKEN_KEY);
          setAuthToken(null);
          setLoggedUser('');
          setLoggedUserRole('NORMAL');
          return;
        }

        setAuthToken(storedToken);
        setLoggedUser(data.username);
        setLoggedUserRole(data.role === 'ADMIN' ? 'ADMIN' : 'NORMAL');

        const storedMenu = sessionStorage.getItem(ACTIVE_MENU_KEY);
        const menuExists = MENU_ITEMS.some((item) => item.id === storedMenu);
        if (menuExists && storedMenu) {
          setActiveMenu(storedMenu);
        }

        const storedRefreshInterval = Number(
          sessionStorage.getItem(DASHBOARD_REFRESH_INTERVAL_KEY),
        );
        if (DASHBOARD_AUTO_REFRESH_OPTIONS.includes(storedRefreshInterval)) {
          setDashboardRefreshIntervalSeconds(storedRefreshInterval);
          setDashboardRefreshCountdown(storedRefreshInterval);
        }

        const storedUsersFilter = sessionStorage.getItem(RESULTS_USERS_FILTER_KEY);
        if (storedUsersFilter) {
          try {
            const parsed = JSON.parse(storedUsersFilter);
            if (Array.isArray(parsed)) {
              setSelectedUsersFilter(parsed);
            }
          } catch {
            sessionStorage.removeItem(RESULTS_USERS_FILTER_KEY);
          }
        }

        const storedVerificationsFilter = sessionStorage.getItem(
          RESULTS_VERIFICATIONS_FILTER_KEY,
        );
        if (storedVerificationsFilter) {
          try {
            const parsed = JSON.parse(storedVerificationsFilter);
            if (Array.isArray(parsed)) {
              setSelectedVerificationsFilter(parsed);
            }
          } catch {
            sessionStorage.removeItem(RESULTS_VERIFICATIONS_FILTER_KEY);
          }
        }
      } catch {
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
        sessionStorage.removeItem(ACTIVE_MENU_KEY);
        sessionStorage.removeItem(DASHBOARD_REFRESH_INTERVAL_KEY);
        sessionStorage.removeItem(RESULTS_USERS_FILTER_KEY);
        sessionStorage.removeItem(RESULTS_VERIFICATIONS_FILTER_KEY);
        setAuthToken(null);
        setLoggedUser('');
        setLoggedUserRole('NORMAL');
      } finally {
        setIsCheckingSession(false);
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    if (isLoggedIn && loggedUserRole === 'ADMIN' && activeMenu === 'checks') {
      fetchVerifications();
    }
  }, [isLoggedIn, loggedUserRole, activeMenu]);

  useEffect(() => {
    if (isLoggedIn && loggedUserRole === 'ADMIN' && activeMenu === 'dashboard') {
      fetchDashboardMetrics();
    }
  }, [isLoggedIn, loggedUserRole, activeMenu]);

  useEffect(() => {
    if (!isLoggedIn || activeMenu !== 'dashboard') {
      setDashboardRefreshCountdown(dashboardRefreshIntervalSeconds);
      return;
    }

    setDashboardRefreshCountdown(dashboardRefreshIntervalSeconds);

    const intervalId = setInterval(() => {
      setDashboardRefreshCountdown((previous) => {
        if (previous <= 1) {
          fetchDashboardMetrics();
          return dashboardRefreshIntervalSeconds;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isLoggedIn, activeMenu, authToken, dashboardRefreshIntervalSeconds]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    sessionStorage.setItem(ACTIVE_MENU_KEY, activeMenu);
  }, [isLoggedIn, activeMenu]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    sessionStorage.setItem(
      DASHBOARD_REFRESH_INTERVAL_KEY,
      String(dashboardRefreshIntervalSeconds),
    );
  }, [isLoggedIn, dashboardRefreshIntervalSeconds]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    sessionStorage.setItem(RESULTS_USERS_FILTER_KEY, JSON.stringify(selectedUsersFilter));
  }, [isLoggedIn, selectedUsersFilter]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    sessionStorage.setItem(
      RESULTS_VERIFICATIONS_FILTER_KEY,
      JSON.stringify(selectedVerificationsFilter),
    );
  }, [isLoggedIn, selectedVerificationsFilter]);

  useEffect(() => {
    if (isLoggedIn && loggedUserRole === 'ADMIN' && activeMenu === 'users') {
      fetchResultsScreenData();
    }
  }, [isLoggedIn, loggedUserRole, activeMenu]);

  useEffect(() => {
    if (isLoggedIn && loggedUserRole === 'ADMIN' && activeMenu === 'devices') {
      fetchDevicesData();
    }
  }, [isLoggedIn, loggedUserRole, activeMenu]);

  useEffect(() => {
    if (isLoggedIn && loggedUserRole === 'ADMIN' && activeMenu === 'accounts') {
      fetchUsersManagementData();
    }
  }, [isLoggedIn, loggedUserRole, activeMenu]);

  useEffect(() => {
    if (!isVerificationFormOpen) {
      return;
    }

    function handleEscapeToCloseVerificationForm(event) {
      if (event.key !== 'Escape' || isSavingVerification) {
        return;
      }

      closeVerificationForm();
    }

    window.addEventListener('keydown', handleEscapeToCloseVerificationForm);

    return () => {
      window.removeEventListener('keydown', handleEscapeToCloseVerificationForm);
    };
  }, [isVerificationFormOpen, isSavingVerification]);

  useEffect(() => {
    if (!verificationToDelete) {
      return;
    }

    function handleEscapeToCloseDeleteModal(event) {
      if (event.key !== 'Escape' || isDeletingVerification) {
        return;
      }

      closeDeleteModal();
    }

    window.addEventListener('keydown', handleEscapeToCloseDeleteModal);

    return () => {
      window.removeEventListener('keydown', handleEscapeToCloseDeleteModal);
    };
  }, [verificationToDelete, isDeletingVerification]);

  useEffect(() => {
    if (!deviceToEditAlias) {
      return;
    }

    function handleEscapeToCloseDeviceAliasModal(event) {
      if (event.key !== 'Escape' || isSavingDeviceAlias) {
        return;
      }

      closeDeviceAliasModal();
    }

    window.addEventListener('keydown', handleEscapeToCloseDeviceAliasModal);

    return () => {
      window.removeEventListener('keydown', handleEscapeToCloseDeviceAliasModal);
    };
  }, [deviceToEditAlias, isSavingDeviceAlias]);

  useEffect(() => {
    if (!selectedStatusUser && !selectedStatusVerification) {
      return;
    }

    function handleEscapeToCloseStatusDetails(event) {
      if (event.key !== 'Escape') {
        return;
      }

      setSelectedStatusUser(null);
      setSelectedStatusVerification(null);
    }

    window.addEventListener('keydown', handleEscapeToCloseStatusDetails);

    return () => {
      window.removeEventListener('keydown', handleEscapeToCloseStatusDetails);
    };
  }, [selectedStatusUser, selectedStatusVerification]);

  async function handleLogin(event) {
    event.preventDefault();
    setMessage('');
    setMessageType('error');
    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage = data?.message || 'Erro ao fazer login.';
        setMessageType('error');
        setMessage(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      setAuthToken(data.token);
      setLoggedUser(username.trim());
      setLoggedUserRole(data.role === 'ADMIN' ? 'ADMIN' : 'NORMAL');
      setActiveMenu('dashboard');
      sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setPassword('');
    } catch {
      setMessageType('error');
      setMessage('Não foi possível conectar ao backend.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    const trimmedUsername = registerUsername.trim();

    if (!trimmedUsername || !registerPassword || !registerConfirmPassword) {
      setMessageType('error');
      setMessage('Informe usuário e senha para criar a conta.');
      return;
    }

    if (registerPassword.length < 6) {
      setMessageType('error');
      setMessage('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      setMessageType('error');
      setMessage('A confirmação de senha não confere.');
      return;
    }

    setMessage('');
    setMessageType('error');
    setIsRegistering(true);

    try {
      const response = await fetch(getApiUrl('/auth/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: trimmedUsername,
          password: registerPassword,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage = data?.message || 'Não foi possível criar usuário.';
        setMessageType('error');
        setMessage(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      setMessageType('success');
      setMessage('Usuário criado com sucesso');
      setAuthView('login');
      setUsername(trimmedUsername);
      setPassword('');
      setRegisterUsername('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
    } catch {
      setMessageType('error');
      setMessage('Não foi possível conectar ao backend para criar usuário.');
    } finally {
      setIsRegistering(false);
    }
  }

  function handleLogout() {
    setAuthToken(null);
    setLoggedUser('');
    setLoggedUserRole('NORMAL');
    setPassword('');
    setMessage('');
    setMessageType('error');
    setAuthView('login');
    setRegisterUsername('');
    setRegisterPassword('');
    setRegisterConfirmPassword('');
    setActiveMenu('dashboard');
    setSelectedUsersFilter([]);
    setSelectedVerificationsFilter([]);
    setSelectedStatusUser(null);
    setSelectedStatusVerification(null);
    setDashboardRefreshIntervalSeconds(DEFAULT_DASHBOARD_AUTO_REFRESH_SECONDS);
    setDashboardRefreshCountdown(DEFAULT_DASHBOARD_AUTO_REFRESH_SECONDS);
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmNewPasswordInput('');
    setChangePasswordError('');
    setChangePasswordSuccess('');
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(ACTIVE_MENU_KEY);
    sessionStorage.removeItem(DASHBOARD_REFRESH_INTERVAL_KEY);
    sessionStorage.removeItem(RESULTS_USERS_FILTER_KEY);
    sessionStorage.removeItem(RESULTS_VERIFICATIONS_FILTER_KEY);
  }

  function getAuthHeaders(authToken) {
    return authToken
      ? {
          Authorization: `Bearer ${authToken}`,
        }
      : {};
  }

  function updateVerificationForm(field, value) {
    setVerificationForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function openCreateVerificationForm() {
    setEditingVerificationId(null);
    setVerificationError('');
    setVerificationForm(EMPTY_VERIFICATION_FORM);
    setIsVerificationFormOpen(true);
  }

  function openEditVerificationForm(verification) {
    setEditingVerificationId(verification.id);
    setVerificationError('');
    setVerificationForm({
      name: verification.name,
      description: verification.description,
      active: verification.active,
      command: verification.command,
      validationType:
        verification.validationType ?? (verification.verificationRegex ? 'regex' : 'exact'),
      validationValue:
        verification.validationValue ?? verification.verificationRegex ?? verification.expectedOutput ?? '',
    });
    setIsVerificationFormOpen(true);
  }

  function closeVerificationForm() {
    setIsVerificationFormOpen(false);
    setEditingVerificationId(null);
    setVerificationForm(EMPTY_VERIFICATION_FORM);
  }

  function openDeleteModal(verification) {
    setVerificationToDelete(verification);
  }

  function closeDeleteModal() {
    if (isDeletingVerification) {
      return;
    }

    setVerificationToDelete(null);
  }

  async function fetchVerifications() {
    setVerificationError('');
    setIsLoadingVerifications(true);

    try {
      const response = await fetch(getApiUrl('/verifications'), {
        method: 'GET',
        headers: getAuthHeaders(authToken),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          setMessage('Sua sessao expirou. Faça login novamente.');
          return;
        }

        const errorMessage = data?.message || 'Não foi possível carregar regras.';
        setVerificationError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      setVerifications(Array.isArray(data) ? data : []);
    } catch {
      setVerificationError('Não foi possível conectar ao backend para listar regras.');
    } finally {
      setIsLoadingVerifications(false);
    }
  }

  async function fetchResultsScreenData() {
    setIsLoadingResults(true);
    setResultsError('');

    try {
      const [resultsResponse, activeVerificationsResponse, devicesResponse] = await Promise.all([
        fetch(getApiUrl('/verification-results'), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }),
        fetch(getApiUrl('/verifications/active'), {
          method: 'GET',
          headers: getAuthHeaders(authToken),
        }),
        fetch(getApiUrl('/verification-results/devices'), {
          method: 'GET',
          headers: getAuthHeaders(authToken),
        }),
      ]);

      const resultsPayload = await resultsResponse.json().catch(() => null);
      const activeVerificationsPayload = await activeVerificationsResponse
        .json()
        .catch(() => null);
      const devicesPayload = await devicesResponse.json().catch(() => null);

      if (resultsResponse.status === 401 || devicesResponse.status === 401) {
        handleLogout();
        setMessage('Sua sessão expirou. Faça login novamente.');
        return;
      }

      if (!resultsResponse.ok) {
        const errorMessage = resultsPayload?.message || 'Não foi possível carregar resultados.';
        setResultsError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      if (!activeVerificationsResponse.ok) {
        const errorMessage =
          activeVerificationsPayload?.message ||
          'Não foi possível carregar regras ativas.';
        setResultsError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      if (!devicesResponse.ok) {
        const errorMessage = devicesPayload?.message || 'Não foi possível carregar apelidos.';
        setResultsError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      const safeResults = Array.isArray(resultsPayload) ? resultsPayload : [];
      const safeActiveVerifications = Array.isArray(activeVerificationsPayload)
        ? activeVerificationsPayload
        : [];
      const safeDevices = Array.isArray(devicesPayload) ? devicesPayload : [];

      const aliasByMachineId = buildAliasMap(safeDevices);
      const enrichedResults = safeResults.map((row) => ({
        ...row,
        preferredName: getPreferredDisplayName(row, aliasByMachineId),
      }));

      setResultsData(enrichedResults);
      setActiveVerifications(safeActiveVerifications);
    } catch {
      setResultsError('Não foi possível conectar ao backend para carregar resultados.');
    } finally {
      setIsLoadingResults(false);
    }
  }

  async function fetchDashboardMetrics() {
    setIsLoadingDashboard(true);
    setDashboardError('');

    try {
      const [resultsResponse, activeVerificationsResponse, devicesResponse] = await Promise.all([
        fetch(getApiUrl('/verification-results'), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }),
        fetch(getApiUrl('/verifications/active'), {
          method: 'GET',
          headers: getAuthHeaders(authToken),
        }),
        fetch(getApiUrl('/verification-results/devices'), {
          method: 'GET',
          headers: getAuthHeaders(authToken),
        }),
      ]);

      const resultsPayload = await resultsResponse.json().catch(() => null);
      const activeVerificationsPayload = await activeVerificationsResponse
        .json()
        .catch(() => null);
      const devicesPayload = await devicesResponse.json().catch(() => null);

      if (resultsResponse.status === 401 || devicesResponse.status === 401) {
        handleLogout();
        setMessage('Sua sessão expirou. Faça login novamente.');
        return;
      }

      if (!resultsResponse.ok) {
        const errorMessage = resultsPayload?.message || 'Não foi possível carregar métricas.';
        setDashboardError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      if (!activeVerificationsResponse.ok) {
        const errorMessage =
          activeVerificationsPayload?.message ||
          'Não foi possível carregar regras ativas.';
        setDashboardError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      if (!devicesResponse.ok) {
        const errorMessage = devicesPayload?.message || 'Não foi possível carregar apelidos.';
        setDashboardError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      const results = Array.isArray(resultsPayload) ? resultsPayload : [];
      const activeChecks = Array.isArray(activeVerificationsPayload)
        ? activeVerificationsPayload
        : [];
      const safeDevices = Array.isArray(devicesPayload) ? devicesPayload : [];
      const aliasByMachineId = buildAliasMap(safeDevices);

      const enrichedResults = results.map((row) => ({
        ...row,
        preferredName: getPreferredDisplayName(row, aliasByMachineId),
      }));

      const users = Array.from(new Set(enrichedResults.map((row) => row.preferredName)));

      const latestByPair = new Map();
      for (const row of enrichedResults) {
        const key = `${row.preferredName}::${row.verificationId}`;
        const current = latestByPair.get(key);

        if (!current) {
          latestByPair.set(key, row);
          continue;
        }

        const currentDate = new Date(current.receivedAt).getTime();
        const rowDate = new Date(row.receivedAt).getTime();
        if (rowDate >= currentDate) {
          latestByPair.set(key, row);
        }
      }

      let okCount = 0;
      let errorCount = 0;
      let notExecutedCount = 0;
      const pendingUsersRanking = [];

      const latestByUser = new Map();
      for (const row of enrichedResults) {
        const rowDate = new Date(row.receivedAt).getTime();
        if (Number.isNaN(rowDate)) {
          continue;
        }

        const current = latestByUser.get(row.preferredName);
        if (!current || rowDate >= current.timestamp) {
          latestByUser.set(row.preferredName, {
            receivedAt: row.receivedAt,
            timestamp: rowDate,
          });
        }
      }

      for (const user of users) {
        let userErrorCount = 0;
        let userNotExecutedCount = 0;

        for (const verification of activeChecks) {
          const key = `${user}::${verification.id}`;
          const resultRow = latestByPair.get(key);

          if (!resultRow) {
            notExecutedCount += 1;
            userNotExecutedCount += 1;
            continue;
          }

          if (resultRow.result === 'success') {
            okCount += 1;
          } else {
            errorCount += 1;
            userErrorCount += 1;
          }
        }

        const pendingCount = userErrorCount + userNotExecutedCount;
        if (pendingCount > 0) {
          pendingUsersRanking.push({
            username: user,
            pendingCount,
            errorCount: userErrorCount,
            notExecutedCount: userNotExecutedCount,
          });
        }
      }

      pendingUsersRanking.sort((a, b) => {
        if (b.pendingCount !== a.pendingCount) {
          return b.pendingCount - a.pendingCount;
        }

        if (b.errorCount !== a.errorCount) {
          return b.errorCount - a.errorCount;
        }

        if (b.notExecutedCount !== a.notExecutedCount) {
          return b.notExecutedCount - a.notExecutedCount;
        }

        return a.username.localeCompare(b.username);
      });

      const staleUsersRanking = users
        .map((user) => {
          const userLatest = latestByUser.get(user);
          const timestamp = userLatest?.timestamp ?? null;

          return {
            username: user,
            lastReceivedAt: userLatest?.receivedAt ?? null,
            elapsedLabel: formatElapsedFromTimestamp(timestamp),
            elapsedMinutes: timestamp ? Math.floor((Date.now() - timestamp) / 60000) : null,
          };
        })
        .sort((a, b) => {
          const aElapsed = a.elapsedMinutes === null ? -1 : a.elapsedMinutes;
          const bElapsed = b.elapsedMinutes === null ? -1 : b.elapsedMinutes;

          if (bElapsed !== aElapsed) {
            return bElapsed - aElapsed;
          }

          return a.username.localeCompare(b.username);
        });

      setDashboardMetrics({
        usersCount: users.length,
        activeVerificationsCount: activeChecks.length,
        errorCount,
        notExecutedCount,
        okCount,
        pendingUsersRanking,
        staleUsersRanking,
      });
    } catch {
      setDashboardError('Não foi possível conectar ao backend para carregar métricas.');
    } finally {
      setIsLoadingDashboard(false);
    }
  }

  async function fetchDevicesData() {
    setIsLoadingDevices(true);
    setDevicesError('');

    try {
      const response = await fetch(getApiUrl('/verification-results/devices'), {
        method: 'GET',
        headers: getAuthHeaders(authToken),
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        handleLogout();
        setMessage('Sua sessão expirou. Faça login novamente.');
        return;
      }

      if (!response.ok) {
        const errorMessage = payload?.message || 'Não foi possível carregar dispositivos.';
        setDevicesError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      const devices = Array.isArray(payload) ? payload : [];
      setDevicesData(devices);
    } catch {
      setDevicesError('Não foi possível conectar ao backend para carregar dispositivos.');
    } finally {
      setIsLoadingDevices(false);
    }
  }

  function openDeviceAliasModal(device) {
    setDeviceToEditAlias(device);
    setDeviceAliasInput(device.alias ?? '');
    setDevicesError('');
  }

  function closeDeviceAliasModal() {
    if (isSavingDeviceAlias) {
      return;
    }

    setDeviceToEditAlias(null);
    setDeviceAliasInput('');
  }

  async function handleSaveDeviceAlias(event) {
    event.preventDefault();

    if (!deviceToEditAlias) {
      return;
    }

    setIsSavingDeviceAlias(true);
    setDevicesError('');

    try {
      const response = await fetch(
        getApiUrl(`/verification-results/devices/${encodeURIComponent(
          deviceToEditAlias.machineId,
        )}/alias`),
        {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(authToken),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ alias: deviceAliasInput }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        handleLogout();
        setMessage('Sua sessão expirou. Faça login novamente.');
        return;
      }

      if (!response.ok) {
        const errorMessage = payload?.message || 'Não foi possível salvar apelido.';
        setDevicesError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      closeDeviceAliasModal();
      await fetchDevicesData();
    } catch {
      setDevicesError('Não foi possível conectar ao backend para salvar apelido.');
    } finally {
      setIsSavingDeviceAlias(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    setChangePasswordError('');
    setChangePasswordSuccess('');

    if (!currentPasswordInput || !newPasswordInput || !confirmNewPasswordInput) {
      setChangePasswordError('Preencha todos os campos de senha.');
      return;
    }

    if (newPasswordInput !== confirmNewPasswordInput) {
      setChangePasswordError('A confirmação da nova senha não confere.');
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await fetch(getApiUrl('/auth/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        if (payload?.message === 'Senha atual inválida.') {
          setChangePasswordError('Senha atual inválida.');
          return;
        }

        handleLogout();
        setMessage('Sua sessão expirou. Faça login novamente.');
        return;
      }

      if (!response.ok) {
        const errorMessage = payload?.message || 'Não foi possível alterar senha.';
        setChangePasswordError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      setChangePasswordSuccess('Senha alterada com sucesso.');
    } catch {
      setChangePasswordError('Não foi possível conectar ao backend para alterar senha.');
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function fetchUsersManagementData() {
    setIsLoadingUsersManagement(true);
    setUsersManagementError('');

    try {
      const response = await fetch(getApiUrl('/auth/users'), {
        method: 'GET',
        headers: getAuthHeaders(authToken),
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        handleLogout();
        setMessage('Sua sessão expirou. Faça login novamente.');
        return;
      }

      if (!response.ok) {
        const errorMessage = payload?.message || 'Não foi possível carregar usuários.';
        setUsersManagementError(
          Array.isArray(errorMessage) ? errorMessage[0] : errorMessage,
        );
        return;
      }

      setUsersManagementData(Array.isArray(payload) ? payload : []);
    } catch {
      setUsersManagementError('Não foi possível conectar ao backend para carregar usuários.');
    } finally {
      setIsLoadingUsersManagement(false);
    }
  }

  async function handleToggleAdmin(user) {
    const nextRole = user.role === 'ADMIN' ? 'NORMAL' : 'ADMIN';
    setIsUpdatingUserRole(true);
    setUsersManagementError('');

    try {
      const response = await fetch(getApiUrl(`/auth/users/${user.id}/role`), {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(authToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: nextRole }),
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        handleLogout();
        setMessage('Sua sessão expirou. Faça login novamente.');
        return;
      }

      if (!response.ok) {
        const errorMessage = payload?.message || 'Não foi possível atualizar perfil.';
        setUsersManagementError(
          Array.isArray(errorMessage) ? errorMessage[0] : errorMessage,
        );
        return;
      }

      if (user.username === loggedUser && nextRole === 'NORMAL') {
        handleLogout();
        setMessageType('error');
        setMessage('Seu perfil de administrador foi removido. Faça login novamente.');
        return;
      }

      await fetchUsersManagementData();
    } catch {
      setUsersManagementError('Não foi possível conectar ao backend para atualizar perfil.');
    } finally {
      setIsUpdatingUserRole(false);
    }
  }

  function handleManualDashboardRefresh() {
    setDashboardRefreshCountdown(dashboardRefreshIntervalSeconds);
    fetchDashboardMetrics();
  }

  function handleDashboardRefreshIntervalChange(seconds) {
    setDashboardRefreshIntervalSeconds(seconds);
    setDashboardRefreshCountdown(seconds);
  }

  function getLatestResultByUserAndVerification() {
    const latest = new Map();

    for (const row of resultsData) {
      const preferredName = getPreferredDisplayName(row);
      const key = `${preferredName}::${row.verificationId}`;
      const current = latest.get(key);

      if (!current) {
        latest.set(key, row);
        continue;
      }

      const currentDate = new Date(current.receivedAt).getTime();
      const rowDate = new Date(row.receivedAt).getTime();

      if (rowDate >= currentDate) {
        latest.set(key, row);
      }
    }

    return latest;
  }

  function getUsersUniverse() {
    const users = new Set(resultsData.map((row) => getPreferredDisplayName(row)));
    return Array.from(users).sort((a, b) => a.localeCompare(b));
  }

  const usersUniverse = getUsersUniverse();

  const userFilterOptions = usersUniverse.map((user) => ({
    value: user,
    label: user,
  }));

  const verificationFilterOptions = activeVerifications.map((verification) => ({
    value: verification.id,
    label: verification.name,
  }));

  const selectedUserOptions = userFilterOptions.filter((option) =>
    selectedUsersFilter.includes(option.value),
  );

  const selectedVerificationOptions = verificationFilterOptions.filter((option) =>
    selectedVerificationsFilter.includes(option.value),
  );

  const filteredUsers =
    selectedUsersFilter.length > 0 ? selectedUsersFilter : usersUniverse;

  const filteredVerifications =
    selectedVerificationsFilter.length > 0
      ? activeVerifications.filter((verification) =>
          selectedVerificationsFilter.includes(verification.id),
        )
      : activeVerifications;

  const latestResultMap = getLatestResultByUserAndVerification();

  const selectedUserVerificationRows = selectedStatusUser
    ? activeVerifications.map((verification) => {
        const key = `${selectedStatusUser}::${verification.id}`;
        const resultRow = latestResultMap.get(key);
        const status = !resultRow
          ? 'not-executed'
          : resultRow.result === 'success'
            ? 'success'
            : 'error';

        return {
          verificationId: verification.id,
          verificationName: verification.name,
          processedAt: resultRow?.processedAt ?? null,
          receivedAt: resultRow?.receivedAt ?? null,
          status,
          output: resultRow?.output?.trim() ? resultRow.output : '-',
        };
      })
    : [];

  const selectedVerificationUserRows = selectedStatusVerification
    ? usersUniverse.map((user) => {
        const key = `${user}::${selectedStatusVerification.id}`;
        const resultRow = latestResultMap.get(key);
        const status = !resultRow
          ? 'not-executed'
          : resultRow.result === 'success'
            ? 'success'
            : 'error';

        return {
          user,
          processedAt: resultRow?.processedAt ?? null,
          receivedAt: resultRow?.receivedAt ?? null,
          status,
          output: resultRow?.output?.trim() ? resultRow.output : '-',
        };
      })
    : [];

  const userResultRows = filteredUsers.map((user) => {
    let okCount = 0;
    let errorCount = 0;
    let notExecutedCount = 0;

    for (const verification of activeVerifications) {
      const key = `${user}::${verification.id}`;
      const resultRow = latestResultMap.get(key);

      if (!resultRow) {
        notExecutedCount += 1;
        continue;
      }

      if (resultRow.result === 'success') {
        okCount += 1;
      } else {
        errorCount += 1;
      }
    }

    return {
      user,
      okCount,
      errorCount,
      notExecutedCount,
      status:
        errorCount > 0 ? 'error' : notExecutedCount > 0 ? 'not-executed' : 'success',
    };
  });

  const verificationResultRows = filteredVerifications.map((verification) => {
    let usersOk = 0;
    let usersError = 0;
    let usersNotExecuted = 0;

    for (const user of usersUniverse) {
      const key = `${user}::${verification.id}`;
      const resultRow = latestResultMap.get(key);

      if (!resultRow) {
        usersNotExecuted += 1;
        continue;
      }

      if (resultRow.result === 'success') {
        usersOk += 1;
      } else {
        usersError += 1;
      }
    }

    return {
      verification,
      usersOk,
      usersError,
      usersNotExecuted,
      status:
        usersError > 0 ? 'error' : usersNotExecuted > 0 ? 'not-executed' : 'success',
    };
  });

  function getResultStatusMeta(status) {
    if (status === 'error') {
      return {
        icon: 'error',
        label: 'Erro',
        className: 'results-status-error',
      };
    }

    if (status === 'not-executed') {
      return {
        icon: 'hourglass_empty',
        label: 'Sem executar',
        className: 'results-status-not-executed',
      };
    }

    return {
      icon: 'check_circle',
      label: 'Sucesso',
      className: 'results-status-success',
    };
  }

  function closeStatusDetailsModal() {
    setSelectedStatusUser(null);
    setSelectedStatusVerification(null);
  }

  async function handleSaveVerification(event) {
    event.preventDefault();
    setVerificationError('');
    setIsSavingVerification(true);

    const payload = {
      name: verificationForm.name.trim(),
      description: verificationForm.description.trim(),
      active: verificationForm.active,
      command: verificationForm.command.trim(),
      validationType: verificationForm.validationType,
      validationValue: verificationForm.validationValue.trim(),
    };

    const isEditing = editingVerificationId !== null;
    const endpoint = isEditing
      ? getApiUrl(`/verifications/${editingVerificationId}`)
      : getApiUrl('/verifications');
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          ...getAuthHeaders(authToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          setMessage('Sua sessao expirou. Faça login novamente.');
          return;
        }

        const errorMessage = data?.message || 'Não foi possível salvar regra.';
        setVerificationError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      closeVerificationForm();
      await fetchVerifications();
    } catch {
      setVerificationError('Não foi possível conectar ao backend para salvar regra.');
    } finally {
      setIsSavingVerification(false);
    }
  }

  async function handleDeleteVerification() {
    if (!verificationToDelete) {
      return;
    }

    setVerificationError('');
    setIsDeletingVerification(true);

    try {
      const response = await fetch(
        getApiUrl(`/verifications/${verificationToDelete.id}`),
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          setMessage('Sua sessao expirou. Faça login novamente.');
          return;
        }

        const errorMessage = data?.message || 'Não foi possível excluir regra.';
        setVerificationError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
        return;
      }

      closeDeleteModal();
      await fetchVerifications();
    } catch {
      setVerificationError('Não foi possível conectar ao backend para excluir regra.');
    } finally {
      setIsDeletingVerification(false);
    }
  }

  const selectedMenu =
    MENU_ITEMS.find((item) => item.id === activeMenu) ?? MENU_ITEMS[0];

  const isAdmin = loggedUserRole === 'ADMIN';
  const adminsCount = usersManagementData.filter((user) => user.role === 'ADMIN').length;

  const dashboardRefreshProgress =
    ((dashboardRefreshIntervalSeconds - dashboardRefreshCountdown) /
      dashboardRefreshIntervalSeconds) *
    100;

  if (isCheckingSession) {
    return (
      <main className="page">
        <section className="card">
          <header className="hero">
            <div className="icon-wrap" aria-hidden="true">
              <span className="material-symbols-outlined brand-icon">monitoring</span>
            </div>
            <h1>DEM</h1>
            <p>Validando sessao...</p>
          </header>
        </section>
      </main>
    );
  }

  return (
    <main className={isLoggedIn ? 'dashboard-page' : 'page'}>
      {!isLoggedIn ? (
        <section className="card">
          <header className="hero">
            <div className="icon-wrap" aria-hidden="true">
              <span className="material-symbols-outlined brand-icon">monitoring</span>
            </div>
            <h1>DEM</h1>
            <p>
              {authView === 'login'
                ? 'Development Environment Monitoring'
                : 'Criação de usuário'}
            </p>
          </header>

          {authView === 'login' ? (
            <form onSubmit={handleLogin} className="form">
              <label className="field">
                <span>Usuário</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  autoComplete="off"
                />
              </label>

              <label className="field">
                <span>Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              {message ? (
                <p className={messageType === 'success' ? 'success-message' : 'error-message'}>
                  {message}
                </p>
              ) : null}

              <div className="login-actions">
                <button type="submit" className="primary-btn" disabled={isLoading || isRegistering}>
                  <span>{isLoading ? 'Entrando...' : 'Entrar'}</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>

                <button
                  type="button"
                  className="menu-btn login-register-btn"
                  onClick={() => {
                    setMessage('');
                    setMessageType('error');
                    setAuthView('register');
                  }}
                  disabled={isRegistering || isLoading}
                >
                  <span className="material-symbols-outlined">person_add</span>
                  <span>Criar usuário</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="form">
              <label className="field">
                <span>Usuário</span>
                <input
                  type="text"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                  required
                  autoComplete="off"
                />
              </label>

              <label className="field">
                <span>Senha</span>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  required
                  minLength={6}
                />
              </label>

              <label className="field">
                <span>Confirmar senha</span>
                <input
                  type="password"
                  value={registerConfirmPassword}
                  onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                  required
                  minLength={6}
                />
              </label>

              {message ? (
                <p className={messageType === 'success' ? 'success-message' : 'error-message'}>
                  {message}
                </p>
              ) : null}

              <div className="login-actions">
                <button type="submit" className="primary-btn" disabled={isRegistering || isLoading}>
                  <span>{isRegistering ? 'Cadastrando...' : 'Cadastrar'}</span>
                  <span className="material-symbols-outlined">check</span>
                </button>

                <button
                  type="button"
                  className="menu-btn login-register-btn"
                  onClick={() => {
                    setMessage('');
                    setMessageType('error');
                    setAuthView('login');
                  }}
                  disabled={isRegistering || isLoading}
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                  <span>Voltar para login</span>
                </button>
              </div>
            </form>
          )}
        </section>
      ) : (
        <section className="dashboard-layout">
          <aside className="sidebar">
            <div className="brand-block">
              <div className="icon-wrap" aria-hidden="true">
                <span className="material-symbols-outlined brand-icon">monitoring</span>
              </div>
              <div>
                <h1>DEM</h1>
                <p>{loggedUser}</p>
              </div>
            </div>

            <nav className="menu-list" aria-label="Menu principal">
              {(isAdmin ? MENU_ITEMS : []).map((item) => {
                const isActive = item.id === activeMenu;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveMenu(item.id)}
                    className={`menu-btn ${isActive ? 'menu-btn-active' : ''}`}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <button type="button" className="secondary-btn logout-btn" onClick={handleLogout}>
              <span>Deslogar</span>
              <span className="material-symbols-outlined">logout</span>
            </button>
          </aside>

          <div className="page-content">
            {!isAdmin ? (
              <div className="content-placeholder">
                <h2>Acesso restrito</h2>
                <p>Solicite acesso ao administrador</p>
              </div>
            ) : selectedMenu.id === 'dashboard' ? (
              <section className="dash-page">
                <div className="dash-header">
                  <div className="dash-auto-refresh" aria-live="polite">
                    <div className="dash-auto-refresh-row">
                      <span
                        className={`dash-refresh-dot ${isLoadingDashboard ? 'dash-refresh-dot-loading' : ''}`}
                      />
                      <span>Próxima atualização em {dashboardRefreshCountdown}s</span>
                    </div>
                    <div className="dash-refresh-options" role="group" aria-label="Intervalo de atualização">
                      {DASHBOARD_AUTO_REFRESH_OPTIONS.map((seconds) => (
                        <button
                          key={seconds}
                          type="button"
                          className={`dash-refresh-option ${
                            dashboardRefreshIntervalSeconds === seconds
                              ? 'dash-refresh-option-active'
                              : ''
                          }`}
                          onClick={() => handleDashboardRefreshIntervalChange(seconds)}
                        >
                          {seconds}s
                        </button>
                      ))}
                    </div>
                    <div className="dash-refresh-track" role="presentation">
                      <div
                        className="dash-refresh-fill"
                        style={{ width: `${dashboardRefreshProgress}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="menu-btn dash-refresh"
                    onClick={handleManualDashboardRefresh}
                    disabled={isLoadingDashboard}
                  >
                    <span className="material-symbols-outlined">refresh</span>
                    <span>{isLoadingDashboard ? 'Atualizando...' : 'Atualizar'}</span>
                  </button>
                </div>

                {dashboardError ? <p className="error-message">{dashboardError}</p> : null}

                <div className="dash-grid">
                  <article className="dash-card">
                    <h3>Dispositivos monitorados</h3>
                    <p>{dashboardMetrics.usersCount}</p>
                  </article>

                  <article className="dash-card">
                    <h3>Regras ativas</h3>
                    <p>{dashboardMetrics.activeVerificationsCount}</p>
                  </article>

                  <article className="dash-card dash-card-error">
                    <h3>Falhas</h3>
                    <p>{dashboardMetrics.errorCount}</p>
                  </article>

                  <article className="dash-card dash-card-neutral">
                    <h3>Pendentes de execução</h3>
                    <p>{dashboardMetrics.notExecutedCount}</p>
                  </article>

                  <article className="dash-card dash-card-success">
                    <h3>Execuções com sucesso</h3>
                    <p>{dashboardMetrics.okCount}</p>
                  </article>
                </div>

                <div className="dash-ranking-grid">
                  <article className="dash-ranking-card">
                    <h3>Dispositivos com mais pendências</h3>
                    {dashboardMetrics.pendingUsersRanking.length === 0 ? (
                      <p className="dash-empty-state">Nenhuma pendência encontrada.</p>
                    ) : (
                      <div className="dash-table-wrap">
                        <table className="dash-table">
                          <thead>
                            <tr>
                              <th>Dispositivo</th>
                              <th>Pendências</th>
                              <th>Falhas</th>
                              <th>Sem executar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardMetrics.pendingUsersRanking.slice(0, 10).map((row) => (
                              <tr key={row.username}>
                                <td>{row.username}</td>
                                <td>{row.pendingCount}</td>
                                <td>{row.errorCount}</td>
                                <td>{row.notExecutedCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>

                  <article className="dash-ranking-card">
                    <h3>Dispositivos há mais tempo sem comunicar</h3>
                    {dashboardMetrics.staleUsersRanking.length === 0 ? (
                      <p className="dash-empty-state">Sem dados de comunicação para exibir.</p>
                    ) : (
                      <div className="dash-table-wrap">
                        <table className="dash-table">
                          <thead>
                            <tr>
                              <th>Dispositivo</th>
                              <th>Última comunicação</th>
                              <th>Tempo sem comunicar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardMetrics.staleUsersRanking.slice(0, 10).map((row) => (
                              <tr key={row.username}>
                                <td>{row.username}</td>
                                <td>{formatDateTime(row.lastReceivedAt)}</td>
                                <td>{row.elapsedLabel}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                </div>
              </section>
            ) : selectedMenu.id === 'users' ? (
              <section className="results-page">
                <div className="results-header">
                  <h2>Painel de Status</h2>
                  <div className="results-mode-switch">
                    <button
                      type="button"
                      className={`menu-btn ${resultsMode === 'by-user' ? 'menu-btn-active' : ''}`}
                      onClick={() => setResultsMode('by-user')}
                    >
                      Por dispositivo
                    </button>
                    <button
                      type="button"
                      className={`menu-btn ${resultsMode === 'by-verification' ? 'menu-btn-active' : ''}`}
                      onClick={() => setResultsMode('by-verification')}
                    >
                      Por regra
                    </button>
                  </div>
                </div>

                {resultsError ? <p className="error-message">{resultsError}</p> : null}

                {resultsMode === 'by-user' ? (
                  <div className="results-filter-wrap">
                    <label className="field">
                      <Select
                        isMulti
                        classNamePrefix="results-select"
                        components={clickableMultiValueComponents}
                        options={userFilterOptions}
                        value={selectedUserOptions}
                        onChange={(options) =>
                          setSelectedUsersFilter((options ?? []).map((option) => option.value))
                        }
                        placeholder="Selecione um ou mais dispositivos"
                        noOptionsMessage={() => 'Nenhum dispositivo encontrado'}
                        closeMenuOnSelect={false}
                        isClearable
                      />
                    </label>
                  </div>
                ) : (
                  <div className="results-filter-wrap">
                    <label className="field">
                      <Select
                        isMulti
                        classNamePrefix="results-select"
                        components={clickableMultiValueComponents}
                        options={verificationFilterOptions}
                        value={selectedVerificationOptions}
                        onChange={(options) =>
                          setSelectedVerificationsFilter(
                            (options ?? []).map((option) => option.value),
                          )
                        }
                        placeholder="Selecione uma ou mais regras"
                        noOptionsMessage={() => 'Nenhuma regra encontrada'}
                        closeMenuOnSelect={false}
                        isClearable
                      />
                    </label>
                  </div>
                )}

                <div className="checks-table-wrap">
                  <table className="checks-table">
                    <thead>
                      {resultsMode === 'by-user' ? (
                        <tr>
                          <th>Status</th>
                          <th>Dispositivo</th>
                          <th>Falhas</th>
                          <th>Sucessos</th>
                          <th>Não executadas</th>
                        </tr>
                      ) : (
                        <tr>
                          <th>Status</th>
                          <th>Regra</th>
                          <th>Dispositivos com falha</th>
                          <th>Dispositivos com sucesso</th>
                          <th>Dispositivos sem execução</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {isLoadingResults ? (
                        <tr>
                          <td colSpan="5" className="checks-empty-row">
                            Carregando resultados...
                          </td>
                        </tr>
                      ) : resultsMode === 'by-user' ? (
                        userResultRows.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="checks-empty-row">
                              Nenhum dispositivo encontrado.
                            </td>
                          </tr>
                        ) : (
                          userResultRows.map((row) => {
                            const statusMeta = getResultStatusMeta(row.status);

                            return (
                              <tr
                                key={row.user}
                                className="results-clickable-row"
                                onClick={() => setSelectedStatusUser(row.user)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelectedStatusUser(row.user);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label={`Abrir detalhes por regra do dispositivo ${row.user}`}
                              >
                                <td className="results-status-cell">
                                  <span
                                    className={`material-symbols-outlined results-status-icon ${statusMeta.className}`}
                                    title={statusMeta.label}
                                    aria-label={statusMeta.label}
                                  >
                                    {statusMeta.icon}
                                  </span>
                                </td>
                                <td>{row.user}</td>
                                <td className="results-text-error">{row.errorCount}</td>
                                <td>{row.okCount}</td>
                                <td className="results-text-warning">{row.notExecutedCount}</td>
                              </tr>
                            );
                          })
                        )
                      ) : verificationResultRows.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="checks-empty-row">
                            Nenhuma regra encontrada.
                          </td>
                        </tr>
                      ) : (
                        verificationResultRows.map((row) => {
                          const statusMeta = getResultStatusMeta(row.status);

                          return (
                            <tr
                              key={row.verification.id}
                              className="results-clickable-row"
                              onClick={() => setSelectedStatusVerification(row.verification)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelectedStatusVerification(row.verification);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`Abrir detalhes por dispositivo da regra ${row.verification.name}`}
                            >
                              <td className="results-status-cell">
                                <span
                                  className={`material-symbols-outlined results-status-icon ${statusMeta.className}`}
                                  title={statusMeta.label}
                                  aria-label={statusMeta.label}
                                >
                                  {statusMeta.icon}
                                </span>
                              </td>
                              <td>{row.verification.name}</td>
                              <td className="results-text-error">{row.usersError}</td>
                              <td>{row.usersOk}</td>
                              <td className="results-text-warning">{row.usersNotExecuted}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {resultsMode === 'by-user' && selectedStatusUser ? (
                  <div className="modal-backdrop" onClick={closeStatusDetailsModal}>
                    <div
                      className="modal-card status-details-card"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <h3>Detalhes por regra</h3>
                      <p>
                        Dispositivo: <strong>{selectedStatusUser}</strong>
                      </p>

                      <div className="checks-table-wrap">
                        <table className="checks-table">
                          <thead>
                            <tr>
                              <th>Regra</th>
                              <th>Hora execução</th>
                              <th>Hora recebimento</th>
                              <th>Status</th>
                              <th>Output</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedUserVerificationRows.length === 0 ? (
                              <tr>
                                <td colSpan="5" className="checks-empty-row">
                                  Nenhuma regra ativa encontrada.
                                </td>
                              </tr>
                            ) : (
                              selectedUserVerificationRows.map((row) => {
                                const statusMeta = getResultStatusMeta(row.status);

                                return (
                                  <tr key={row.verificationId}>
                                    <td>{row.verificationName}</td>
                                    <td>{formatDateTime(row.processedAt)}</td>
                                    <td>{formatDateTime(row.receivedAt)}</td>
                                    <td>
                                      <span className={`results-detail-status ${statusMeta.className}`}>
                                        {statusMeta.label}
                                      </span>
                                    </td>
                                    <td className="results-output-cell">{row.output}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="checks-form-actions">
                        <button
                          type="button"
                          className="menu-btn"
                          onClick={closeStatusDetailsModal}
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {resultsMode === 'by-verification' && selectedStatusVerification ? (
                  <div className="modal-backdrop" onClick={closeStatusDetailsModal}>
                    <div
                      className="modal-card status-details-card"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <h3>Detalhes por dispositivo</h3>
                      <p>
                        Regra: <strong>{selectedStatusVerification.name}</strong>
                      </p>

                      <div className="checks-table-wrap">
                        <table className="checks-table">
                          <thead>
                            <tr>
                              <th>Dispositivo</th>
                              <th>Hora execução</th>
                              <th>Hora recebimento</th>
                              <th>Status</th>
                              <th>Output</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedVerificationUserRows.length === 0 ? (
                              <tr>
                                <td colSpan="5" className="checks-empty-row">
                                  Nenhum dispositivo encontrado.
                                </td>
                              </tr>
                            ) : (
                              selectedVerificationUserRows.map((row) => {
                                const statusMeta = getResultStatusMeta(row.status);

                                return (
                                  <tr key={row.user}>
                                    <td>{row.user}</td>
                                    <td>{formatDateTime(row.processedAt)}</td>
                                    <td>{formatDateTime(row.receivedAt)}</td>
                                    <td>
                                      <span className={`results-detail-status ${statusMeta.className}`}>
                                        {statusMeta.label}
                                      </span>
                                    </td>
                                    <td className="results-output-cell">{row.output}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="checks-form-actions">
                        <button
                          type="button"
                          className="menu-btn"
                          onClick={closeStatusDetailsModal}
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : selectedMenu.id === 'checks' ? (
              <section className="checks-page">
                <div className="checks-header">
                  <h2>Regras</h2>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={openCreateVerificationForm}
                  >
                    <span className="material-symbols-outlined">add</span>
                    <span>Nova regra</span>
                  </button>
                </div>

                {verificationError ? <p className="error-message">{verificationError}</p> : null}

                <div className="checks-table-wrap">
                  <table className="checks-table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingVerifications ? (
                        <tr>
                          <td colSpan="3" className="checks-empty-row">
                            Carregando regras...
                          </td>
                        </tr>
                      ) : verifications.length === 0 ? (
                        <tr>
                          <td colSpan="3" className="checks-empty-row">
                            Nenhuma regra cadastrada.
                          </td>
                        </tr>
                      ) : (
                        verifications.map((verification) => (
                          <tr key={verification.id}>
                            <td>{verification.name}</td>
                            <td>
                              {verification.active ? (
                                <span className="checks-status-badge checks-status-active">
                                  <span className="material-symbols-outlined">check_circle</span>
                                  <span>Ativa</span>
                                </span>
                              ) : (
                                <span className="checks-status-badge checks-status-inactive">
                                  <span className="material-symbols-outlined">cancel</span>
                                  <span>Inativa</span>
                                </span>
                              )}
                            </td>
                            <td className="checks-actions">
                              <button
                                type="button"
                                className="menu-btn"
                                onClick={() => openEditVerificationForm(verification)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="menu-btn menu-btn-danger"
                                onClick={() => openDeleteModal(verification)}
                              >
                                Deletar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {isVerificationFormOpen ? (
                  <div className="modal-backdrop" onClick={closeVerificationForm}>
                    <div className="modal-card checks-form" onClick={(event) => event.stopPropagation()}>
                      <h3>{editingVerificationId === null ? 'Criar regra' : 'Editar regra'}</h3>

                      <form onSubmit={handleSaveVerification} className="checks-form-body">
                        <label className="field">
                          <span>Nome</span>
                          <input
                            type="text"
                            required
                            value={verificationForm.name}
                            onChange={(event) => updateVerificationForm('name', event.target.value)}
                          />
                        </label>

                        <label className="field">
                          <span>Descrição</span>
                          <textarea
                            required
                            rows="3"
                            value={verificationForm.description}
                            onChange={(event) =>
                              updateVerificationForm('description', event.target.value)
                            }
                          />
                        </label>

                        <label className="field">
                          <span>Comando</span>
                          <textarea
                            required
                            rows="3"
                            value={verificationForm.command}
                            onChange={(event) => updateVerificationForm('command', event.target.value)}
                          />
                        </label>

                        <label className="field">
                          <span>Tipo de validação</span>
                          <Select
                            classNamePrefix="validation-select"
                            options={[
                              { value: 'exact', label: 'Saída exata' },
                              { value: 'regex', label: 'Regex' },
                            ]}
                            value={
                              verificationForm.validationType === 'regex'
                                ? { value: 'regex', label: 'Regex' }
                                : { value: 'exact', label: 'Saída exata' }
                            }
                            onChange={(option) => {
                              const nextType = option?.value ?? 'exact';
                              updateVerificationForm('validationType', nextType);
                            }}
                            isSearchable={false}
                            isClearable={false}
                            placeholder="Selecione o tipo"
                            menuPortalTarget={document.body}
                            styles={{
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            }}
                          />
                        </label>

                        <label className="field">
                          <span>
                            {verificationForm.validationType === 'regex'
                              ? 'Regex de verificação'
                              : 'Saída esperada'}
                          </span>
                          <textarea
                            required
                            rows="3"
                            value={verificationForm.validationValue}
                            onChange={(event) =>
                              updateVerificationForm('validationValue', event.target.value)
                            }
                            placeholder={
                              verificationForm.validationType === 'regex'
                                ? 'Ex: ^ok$'
                                : 'Ex: ok'
                            }
                          />
                        </label>

                        <label className="checks-checkbox">
                          <input
                            type="checkbox"
                            checked={verificationForm.active}
                            onChange={(event) => updateVerificationForm('active', event.target.checked)}
                          />
                          <span>Ativa</span>
                        </label>

                        <div className="checks-form-actions">
                          <button type="button" className="menu-btn" onClick={closeVerificationForm}>
                            Cancelar
                          </button>
                          <button type="submit" className="primary-btn" disabled={isSavingVerification}>
                            <span>{isSavingVerification ? 'Salvando...' : 'Salvar'}</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : null}

                {verificationToDelete ? (
                  <div className="modal-backdrop" onClick={closeDeleteModal}>
                    <div className="modal-card confirm-card" onClick={(event) => event.stopPropagation()}>
                      <h3>Confirmar exclusão</h3>
                      <p>
                        Deseja realmente deletar a regra <strong>{verificationToDelete.name}</strong>?
                      </p>
                      <div className="checks-form-actions">
                        <button type="button" className="menu-btn" onClick={closeDeleteModal}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="primary-btn danger-btn"
                          onClick={handleDeleteVerification}
                          disabled={isDeletingVerification}
                        >
                          <span>{isDeletingVerification ? 'Deletando...' : 'Deletar'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : selectedMenu.id === 'devices' ? (
              <section className="checks-page">
                <div className="checks-header">
                  <h2>Dispositivos</h2>
                  <button
                    type="button"
                    className="menu-btn dash-refresh"
                    onClick={fetchDevicesData}
                    disabled={isLoadingDevices}
                  >
                    <span className="material-symbols-outlined">refresh</span>
                    <span>{isLoadingDevices ? 'Atualizando...' : 'Atualizar'}</span>
                  </button>
                </div>

                {devicesError ? <p className="error-message">{devicesError}</p> : null}

                <div className="checks-table-wrap">
                  <table className="checks-table">
                    <thead>
                      <tr>
                        <th>Machine ID</th>
                        <th>Apelido</th>
                        <th>Usuário</th>
                        <th>Nome da máquina</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingDevices ? (
                        <tr>
                          <td colSpan="5" className="checks-empty-row">
                            Carregando dispositivos...
                          </td>
                        </tr>
                      ) : devicesData.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="checks-empty-row">
                            Nenhum dispositivo encontrado.
                          </td>
                        </tr>
                      ) : (
                        devicesData.map((device) => (
                          <tr key={device.machineId}>
                            <td>{device.machineId}</td>
                            <td>{device.alias?.trim() ? device.alias : '-'}</td>
                            <td>{device.username}</td>
                            <td>{device.machineName}</td>
                            <td className="checks-actions">
                              <button
                                type="button"
                                className="menu-btn"
                                onClick={() => openDeviceAliasModal(device)}
                              >
                                {device.alias?.trim() ? 'Editar apelido' : 'Definir apelido'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {deviceToEditAlias ? (
                  <div className="modal-backdrop" onClick={closeDeviceAliasModal}>
                    <div className="modal-card confirm-card" onClick={(event) => event.stopPropagation()}>
                      <h3>Apelido do dispositivo</h3>
                      <p>
                        Machine ID: <strong>{deviceToEditAlias.machineId}</strong>
                      </p>
                      <form onSubmit={handleSaveDeviceAlias} className="checks-form-body">
                        <label className="field">
                          <span>Apelido</span>
                          <input
                            type="text"
                            maxLength={120}
                            value={deviceAliasInput}
                            onChange={(event) => setDeviceAliasInput(event.target.value)}
                            placeholder="Ex.: Notebook do João"
                          />
                        </label>

                        <div className="checks-form-actions">
                          <button type="button" className="menu-btn" onClick={closeDeviceAliasModal}>
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="primary-btn"
                            disabled={isSavingDeviceAlias}
                          >
                            <span>{isSavingDeviceAlias ? 'Salvando...' : 'Salvar'}</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : selectedMenu.id === 'settings' ? (
              <section className="checks-page">
                <div className="checks-header">
                  <h2>Configurações</h2>
                </div>

                <form onSubmit={handleChangePassword} className="checks-form">
                  <h3>Alterar senha</h3>

                  <label className="field">
                    <span>Senha atual</span>
                    <input
                      type="password"
                      required
                      value={currentPasswordInput}
                      onChange={(event) => setCurrentPasswordInput(event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Nova senha</span>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPasswordInput}
                      onChange={(event) => setNewPasswordInput(event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Confirmar nova senha</span>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmNewPasswordInput}
                      onChange={(event) => setConfirmNewPasswordInput(event.target.value)}
                    />
                  </label>

                  {changePasswordError ? (
                    <p className="error-message">{changePasswordError}</p>
                  ) : null}
                  {changePasswordSuccess ? (
                    <p className="success-message">{changePasswordSuccess}</p>
                  ) : null}

                  <div className="checks-form-actions">
                    <button
                      type="submit"
                      className="primary-btn"
                      disabled={isChangingPassword}
                    >
                      <span>{isChangingPassword ? 'Salvando...' : 'Salvar nova senha'}</span>
                    </button>
                  </div>
                </form>
              </section>
            ) : selectedMenu.id === 'accounts' ? (
              <section className="checks-page">
                <div className="checks-header">
                  <h2>Usuários</h2>
                  <button
                    type="button"
                    className="menu-btn dash-refresh"
                    onClick={fetchUsersManagementData}
                    disabled={isLoadingUsersManagement || isUpdatingUserRole}
                  >
                    <span className="material-symbols-outlined">refresh</span>
                    <span>
                      {isLoadingUsersManagement ? 'Atualizando...' : 'Atualizar'}
                    </span>
                  </button>
                </div>

                {usersManagementError ? (
                  <p className="error-message">{usersManagementError}</p>
                ) : null}

                <div className="checks-table-wrap">
                  <table className="checks-table">
                    <thead>
                      <tr>
                        <th>Usuário</th>
                        <th>Perfil</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingUsersManagement ? (
                        <tr>
                          <td colSpan="3" className="checks-empty-row">
                            Carregando usuários...
                          </td>
                        </tr>
                      ) : usersManagementData.length === 0 ? (
                        <tr>
                          <td colSpan="3" className="checks-empty-row">
                            Nenhum usuário encontrado.
                          </td>
                        </tr>
                      ) : (
                        usersManagementData.map((user) => {
                          const isLastAdmin = user.role === 'ADMIN' && adminsCount <= 1;

                          return (
                            <tr key={user.id}>
                              <td>{user.username}</td>
                              <td>
                                <span
                                  className={`checks-status-badge ${
                                    user.role === 'ADMIN'
                                      ? 'checks-status-active'
                                      : 'checks-status-inactive'
                                  }`}
                                >
                                  {user.role}
                                </span>
                              </td>
                              <td className="checks-actions">
                                <button
                                  type="button"
                                  className="menu-btn"
                                  onClick={() => handleToggleAdmin(user)}
                                  disabled={isUpdatingUserRole || isLastAdmin}
                                  title={
                                    isLastAdmin
                                      ? 'Não é permitido remover o último administrador.'
                                      : undefined
                                  }
                                >
                                  {user.role === 'ADMIN'
                                    ? 'Remover admin'
                                    : 'Promover a admin'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <div className="content-placeholder">
                <h2>{selectedMenu.title}</h2>
                <p>{selectedMenu.message}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function getApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${API_PREFIX}${normalizedPath}`;
}

function getAuthHeaders(authToken) {
  return authToken
    ? {
        Authorization: `Bearer ${authToken}`,
      }
    : {};
}
