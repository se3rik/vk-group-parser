import { useState, useCallback } from "react";
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Alert,
  Chip,
  Divider,
  InputAdornment,
  IconButton,
  Tooltip,
  Stack,
  CircularProgress,
} from "@mui/material";
import {
  Search,
  Visibility,
  VisibilityOff,
  Info,
  Refresh,
} from "@mui/icons-material";
import {
  fetchPostsInRange,
  fetchLikes,
  fetchUsers,
  fetchOwnerInfo,
} from "./api/vk.ts";

const STORAGE_KEY = "vk_parser_token";

type SortDir = "asc" | "desc";
type SortBy = "name" | "likes" | "percent";
type Status = "idle" | "running" | "done" | "error";

interface VKUser {
  id: number;
  first_name: string;
  last_name: string;
  likes: number;
}

interface Result {
  totalPosts: number;
  users: VKUser[];
  ownerName: string;
}

interface Progress {
  step: string;
  value: number;
  label: string;
}

function toUnix(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthAgoStr(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function App() {
  const [token, setToken] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) || "",
  );
  const [showToken, setShowToken] = useState<boolean>(false);
  const [ownerId, setOwnerId] = useState<string>("-182391115");
  const [dateFrom, setDateFrom] = useState<string>(monthAgoStr());
  const [dateTo, setDateTo] = useState<string>(todayStr());

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<Progress>({
    step: "",
    value: 0,
    label: "",
  });
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);

  const [sortBy, setSortBy] = useState<SortBy>("likes");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleTokenChange = (v: string) => {
    setToken(v);
    localStorage.setItem(STORAGE_KEY, v);
  };

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const sortedUsers: VKUser[] = result
    ? [...result.users].sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        if (sortBy === "name")
          return (
            mul *
            `${a.first_name} ${a.last_name}`.localeCompare(
              `${b.first_name} ${b.last_name}`,
            )
          );
        return mul * (a.likes - b.likes);
      })
    : [];

  const run = useCallback(async () => {
    if (!token.trim()) {
      setError("Введите токен доступа");
      return;
    }
    if (!ownerId.trim()) {
      setError("Введите ID группы или пользователя");
      return;
    }

    setStatus("running");
    setError("");
    setResult(null);

    try {
      setProgress({
        step: "owner",
        value: 0,
        label: "Получаем информацию о странице...",
      });
      const ownerInfo = await fetchOwnerInfo(token, ownerId);

      setProgress({ step: "posts", value: 0, label: "Загружаем посты..." });
      const from = toUnix(dateFrom);
      const to = toUnix(dateTo) + 86399;

      const posts = await fetchPostsInRange(
        token,
        ownerId,
        from,
        to,
        ({ fetched, total }: { fetched: number; total: number }) => {
          const pct = Math.min(100, Math.round((fetched / total) * 100));
          setProgress({
            step: "posts",
            value: pct,
            label: `Загружаем посты... ${fetched} из ${total}`,
          });
        },
      );

      if (!posts.length) {
        setError("Постов в выбранном периоде не найдено.");
        setStatus("error");
        return;
      }

      const likeMap: Record<number, number> = {};

      for (let i = 0; i < posts.length; i++) {
        setProgress({
          step: "likes",
          value: Math.round(((i + 1) / posts.length) * 100),
          label: `Считываем лайки... пост ${i + 1} из ${posts.length}`,
        });
        const likes = await fetchLikes(token, ownerId, posts[i].id);
        for (const uid of likes) {
          likeMap[uid] = (likeMap[uid] || 0) + 1;
        }
        if (i < posts.length - 1) await new Promise((r) => setTimeout(r, 350));
      }

      const userIds = Object.keys(likeMap).map(Number);
      setProgress({
        step: "users",
        value: 0,
        label: `Получаем имена ${userIds.length} пользователей...`,
      });
      const usersRaw = await fetchUsers(token, userIds);

      const users: VKUser[] = userIds.map((id) => {
        const raw = usersRaw.find((u) => u.id === id);

        return {
          id,

          first_name: raw?.first_name || "Unknown",

          last_name: raw?.last_name || "",

          likes: likeMap[id] || 0,
        };
      });

      setResult({ totalPosts: posts.length, users, ownerName: ownerInfo.name });
      setStatus("done");
      setProgress({ step: "done", value: 100, label: "Готово!" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
      setStatus("error");
    }
  }, [token, ownerId, dateFrom, dateTo]);

  const isRunning = status === "running";

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50", py: 4 }}>
      <Container maxWidth="md">
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }} gutterBottom>
            VK Likes Parser
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Анализ лайков постов ВКонтакте за выбранный период
          </Typography>
        </Box>

        <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }} elevation={1}>
          <Stack spacing={3}>
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 1 }}
              >
                Токен доступа
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="vk1.a.xxxxxxx..."
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => handleTokenChange(e.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={showToken ? "Скрыть" : "Показать"}>
                          <IconButton
                            size="small"
                            onClick={() => setShowToken((v) => !v)}
                          >
                            {showToken ? (
                              <VisibilityOff fontSize="small" />
                            ) : (
                              <Visibility fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: "block" }}
              >
                Токен сохраняется в браузере.{" "}
                <a
                  href="https://oauth.vk.com/authorize?client_id=54580893&display=page&redirect_uri=https://oauth.vk.com/blank.html&scope=groups,wall,likes&response_type=token&v=5.131"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "inherit" }}
                >
                  Как получить токен →
                </a>
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 1 }}
              >
                ID группы или пользователя
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="-218967632 (группа) или 12345 (пользователь)"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Tooltip title="Для группы используйте отрицательный ID, например -218967632. Для пользователя — положительный, например 1234567.">
                          <Info
                            fontSize="small"
                            color="action"
                            sx={{ cursor: "help" }}
                          />
                        </Tooltip>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  Дата с
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  Дата по
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>
            </Stack>

            <Button
              variant="contained"
              size="large"
              startIcon={
                isRunning ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <Search />
                )
              }
              onClick={run}
              disabled={isRunning}
              sx={{ alignSelf: "flex-start", borderRadius: 2, px: 4 }}
            >
              {isRunning ? "Парсим..." : "Запустить"}
            </Button>
          </Stack>
        </Paper>

        {isRunning && (
          <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }} elevation={1}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {progress.label}
            </Typography>
            <LinearProgress
              variant={progress.value === 0 ? "indeterminate" : "determinate"}
              value={progress.value}
              sx={{ borderRadius: 1, height: 8 }}
            />
          </Paper>
        )}

        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3, borderRadius: 3 }}
            action={
              <IconButton size="small" onClick={() => setError("")}>
                <Refresh fontSize="small" />
              </IconButton>
            }
          >
            {error}
          </Alert>
        )}

        {result && (
          <Paper sx={{ p: 3, borderRadius: 3 }} elevation={1}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 2,
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {result.ownerName}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                  <Chip
                    label={`Постов: ${result.totalPosts}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label={`Уникальных пользователей: ${result.users.length}`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={48} sx={{ color: "text.secondary" }}>
                      #
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === "name"}
                        direction={sortBy === "name" ? sortDir : "asc"}
                        onClick={() => handleSort("name")}
                      >
                        Пользователь
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortBy === "likes"}
                        direction={sortBy === "likes" ? sortDir : "desc"}
                        onClick={() => handleSort("likes")}
                      >
                        Лайков
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      Из {result.totalPosts} постов
                    </TableCell>
                    <TableCell align="right">%</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedUsers.map((user, i) => {
                    const pct = (
                      (user.likes / result.totalPosts) *
                      100
                    ).toFixed(1);
                    return (
                      <TableRow key={user.id} hover>
                        <TableCell sx={{ color: "text.disabled" }}>
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <Box
                            component="a"
                            href={`https://vk.com/id${user.id}`}
                            target="_blank"
                            rel="noreferrer"
                            sx={{
                              color: "primary.main",
                              textDecoration: "none",
                              "&:hover": { textDecoration: "underline" },
                            }}
                          >
                            {user.first_name} {user.last_name}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography sx={{ fontWeight: 600 }}>
                            {user.likes}
                          </Typography>
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ color: "text.secondary" }}
                        >
                          {user.likes} / {result.totalPosts}
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              justifyContent: "flex-end",
                            }}
                          >
                            <Box
                              sx={{
                                width: 48,
                                height: 6,
                                borderRadius: 1,
                                bgcolor: "grey.200",
                                overflow: "hidden",
                              }}
                            >
                              <Box
                                sx={{
                                  height: "100%",
                                  width: `${pct}%`,
                                  bgcolor:
                                    Number(pct) >= 80
                                      ? "success.main"
                                      : Number(pct) >= 50
                                        ? "primary.main"
                                        : "grey.400",
                                  borderRadius: 1,
                                }}
                              />
                            </Box>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ minWidth: 36 }}
                            >
                              {pct}%
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Container>
    </Box>
  );
}
