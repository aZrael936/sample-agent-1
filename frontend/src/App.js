import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { QAHeader } from "./QAHeader";
import Chat from "./Chat";
import { useState, useEffect } from "react";
import { TextField, Typography } from "@mui/material";
import * as React from "react";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import DeleteIcon from "@mui/icons-material/Delete";
import LoadingSpinner from "./Spinner";
import IconButton from "@mui/material/IconButton";
import SendIcon from "@mui/icons-material/Send";
import UrlSourcesForm from "./WebUrlsForm";
import {modelList} from "./RAGModels"

const App = (props) => {
  const [history, setHistory] = useState([]);
  const [selectedModel, setSelectedModel] = useState(modelList[0]);
  const [baseUrl] = useState(process.env.REACT_APP_BASE_URL);
  const [question, setQuestion] = useState('');
  const [spinner, setSpinner] = useState(false);
  const [sessionId, setSessionId] = useState(undefined);
  const [sourceUrlInfo, setSourceUrlInfo] = useState({
    exclusionFilters: [],
    inclusionFilters: [],
    seedUrlList: [],
  });
  const [hasWebDataSource, setHasWebDataSource] = useState(false);

  // Web data source functionality disabled - backend doesn't support it yet
  // useEffect(() => {
  //   if (!baseUrl) {
  //     return;
  //   }
  //   const getWebSourceConfiguration = async () => {
  //     fetch(baseUrl + "urls", {
  //       method: "GET",
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //     })
  //       .then((res) => res.json())
  //       .then((data) => {
  //         setSourceUrlInfo({
  //           exclusionFilters: data.exclusionFilters ?? [],
  //           inclusionFilters: data.inclusionFilters ?? [],
  //           seedUrlList: data.seedUrlList ?? [],
  //         });
  //         setHasWebDataSource(true);
  //       })
  //       .catch((err) => {
  //         console.log("err", err);
  //       });

  //   };
  //   getWebSourceConfiguration();
  // }, [baseUrl]);

  const handleSendQuestion = () => {
    setSpinner(true);

    fetch(baseUrl + "rag/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestSessionId: sessionId,
        question: question,
        modelId: selectedModel?.modelId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("data", data);
        setSpinner(false);
        setSessionId(data.sessionId);
        setHistory([
          ...history,
          {
            question: question,
            response: data.response,
            citation: data.citation,
          },
        ]);
      })
      .catch((err) => {
        setSpinner(false);
        setHistory([
          ...history,
          {
            question: question,
            response:
              "Error generating an answer. Please check your browser console, WAF configuration, Bedrock model access, and Lambda logs for debugging the error.",
            citation: undefined,
          },
        ]);
      });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSendQuestion();
    }
  };

  const onClearHistory = () => setHistory([]);

  // Web URL update functionality disabled - backend doesn't support it yet
  // const handleUpdateUrls = async (
  //   urls,
  //   newExclusionFilters,
  //   newInclusionFilters
  // ) => {
  //   try {
  //     const response = await fetch(baseUrl + "web-urls", {
  //       method: "POST",
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //       body: JSON.stringify({
  //         urlList: [...new Set(urls)],
  //         exclusionFilters: [...new Set(newExclusionFilters)],
  //         inclusionFilters: [...new Set(newInclusionFilters)],
  //       }),
  //     });
  //     return !!response.ok;
  //   } catch (error) {
  //     console.log("Error:", error);
  //     return false;
  //   }
  // };

  const handleChangeModel = (model) => {
    setSelectedModel(model);
    setSessionId(undefined)
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: "40px 20px",
        backgroundColor: "#f5f5f7",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          padding: { xs: 4, md: 6 },
          maxWidth: 920,
          width: "100%",
          borderRadius: "18px",
          backgroundColor: "#ffffff",
          border: "1px solid rgba(0, 0, 0, 0.06)",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
        }}
      >
        <Box
          sx={{
            textAlign: "center",
            mb: 5,
            pb: 4,
            borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
          }}
        >
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              color: "#1d1d1f",
              mb: 1,
              letterSpacing: "-0.5px",
            }}
          >
            Email Assistant
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: "#86868b",
              fontSize: "17px",
              fontWeight: 400,
            }}
          >
            Draft professional customer service emails with AI
          </Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <QAHeader
            baseUrl={baseUrl}
            modelList={modelList}
            setSelectedModel={handleChangeModel}
            selectedModel={selectedModel}
          />
          <Divider sx={{ my: 4, borderColor: "rgba(0, 0, 0, 0.08)" }} />

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 3,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontSize: "20px",
                fontWeight: 600,
                color: "#1d1d1f",
                letterSpacing: "-0.3px",
              }}
            >
              Conversation
            </Typography>
            <Button
              disabled={history.length === 0}
              startIcon={<DeleteIcon />}
              onClick={onClearHistory}
              variant="text"
              size="small"
              sx={{
                textTransform: "none",
                color: "#06c",
                fontSize: "15px",
                fontWeight: 400,
                "&:hover": {
                  backgroundColor: "rgba(0, 102, 204, 0.08)",
                },
                "&:disabled": {
                  color: "#86868b",
                },
              }}
            >
              Clear
            </Button>
          </Box>
          <Chat history={history} />
          {spinner && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <LoadingSpinner />
            </Box>
          )}
        </Box>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "flex-end",
            mt: 4,
            pt: 4,
            borderTop: "1px solid rgba(0, 0, 0, 0.08)",
          }}
        >
          <TextField
            disabled={spinner || !baseUrl}
            variant="outlined"
            label="Customer Inquiry"
            placeholder="How do I make a lending offer?"
            value={question}
            onChange={(e) => setQuestion(e.target?.value)}
            onKeyDown={handleKeyDown}
            fullWidth
            multiline
            maxRows={4}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: "12px",
                fontSize: "17px",
                backgroundColor: "#fafafa",
                border: "1px solid rgba(0, 0, 0, 0.1)",
                "&:hover": {
                  backgroundColor: "#f5f5f5",
                },
                "&.Mui-focused": {
                  backgroundColor: "#ffffff",
                  border: "1px solid #06c",
                },
                "& fieldset": {
                  border: "none",
                },
              },
              "& .MuiInputLabel-root": {
                color: "#86868b",
                fontSize: "17px",
                "&.Mui-focused": {
                  color: "#06c",
                },
              },
            }}
          />
          <IconButton
            disabled={spinner || !baseUrl}
            onClick={handleSendQuestion}
            sx={{
              bgcolor: "#06c",
              color: "white",
              width: 44,
              height: 44,
              borderRadius: "50%",
              "&:hover": {
                bgcolor: "#0077ed",
              },
              "&:disabled": {
                bgcolor: "#d2d2d7",
                color: "#86868b",
              },
            }}
          >
            <SendIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
        {/* Web data source form disabled - backend doesn't support it yet */}
        {/* {hasWebDataSource ? (
          <Box sx={{ paddingTop: "15px" }}>
            <UrlSourcesForm
              exclusionFilters={sourceUrlInfo.exclusionFilters}
              inclusionFilters={sourceUrlInfo.inclusionFilters}
              seedUrlList={sourceUrlInfo.seedUrlList.map(
                (urlObj) => urlObj.url
              )}
              handleUpdateUrls={handleUpdateUrls}
            />
          </Box>
        ) : null} */}
      </Paper>
    </Box>
  );
};

export default App;
