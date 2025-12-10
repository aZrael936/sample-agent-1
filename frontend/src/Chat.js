import {
  Box,
  Stack,
  Card,
  CardContent,
  Typography,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

const Chat = (props) => {
  const history = props.history;
  const boxRef = useRef(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [history]);

  const handleCopyEmail = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true);
    });
  };

  const handleCloseSnackbar = () => {
    setCopySuccess(false);
  };

  // Function to highlight placeholders in text
  const formatEmailText = (text) => {
    const parts = text.split(/(\{\{[^}]+\}\})/g);
    return parts.map((part, index) => {
      if (part.match(/\{\{[^}]+\}\}/)) {
        return (
          <Box
            component="span"
            key={index}
            sx={{
              backgroundColor: "#f5f5f7",
              color: "#06c",
              padding: "3px 8px",
              borderRadius: "6px",
              fontWeight: 500,
              border: "1px solid rgba(0, 102, 204, 0.2)",
            }}
          >
            {part}
          </Box>
        );
      }
      return part;
    });
  };

  return (
    <>
      <Box
        ref={boxRef}
        sx={{
          backgroundColor: "#fbfbfd",
          borderRadius: "12px",
          padding: 3,
          overflowY: "auto",
          maxHeight: "520px",
          minHeight: "320px",
          border: "1px solid rgba(0, 0, 0, 0.06)",
        }}
      >
        {history?.length > 0 ? (
          <Stack spacing={3}>
            {history?.map((msg, idx) => (
              <Box key={idx}>
                {/* Customer Question */}
                <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                  <Card
                    elevation={0}
                    sx={{
                      backgroundColor: "#06c",
                      color: "white",
                      maxWidth: "70%",
                      borderRadius: "18px",
                      border: "none",
                    }}
                  >
                    <CardContent sx={{ py: 2, px: 2.5, "&:last-child": { pb: 2 } }}>
                      <Typography
                        variant="caption"
                        sx={{
                          opacity: 0.85,
                          fontWeight: 600,
                          fontSize: "11px",
                          letterSpacing: "0.5px",
                          textTransform: "uppercase",
                        }}
                      >
                        Question
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          mt: 0.5,
                          fontSize: "17px",
                          lineHeight: 1.5,
                          fontWeight: 400,
                        }}
                      >
                        {msg.question}
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>

                {/* AI Response */}
                <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
                  <Card
                    elevation={0}
                    sx={{
                      bgcolor: "#ffffff",
                      maxWidth: "85%",
                      borderRadius: "18px",
                      border: "1px solid rgba(0, 0, 0, 0.1)",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                    }}
                  >
                    <CardContent sx={{ py: 2.5, px: 3, "&:last-child": { pb: 2.5 } }}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 1.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            color: "#86868b",
                            fontWeight: 600,
                            fontSize: "11px",
                            letterSpacing: "0.5px",
                            textTransform: "uppercase",
                          }}
                        >
                          Draft Response
                        </Typography>
                        <Tooltip title="Copy to clipboard">
                          <IconButton
                            size="small"
                            onClick={() => handleCopyEmail(msg.response)}
                            sx={{
                              color: "#06c",
                              padding: "6px",
                              "&:hover": {
                                bgcolor: "rgba(0, 102, 204, 0.08)",
                              },
                            }}
                          >
                            <ContentCopyIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Typography
                        variant="body1"
                        sx={{
                          whiteSpace: "pre-line",
                          color: "#1d1d1f",
                          lineHeight: 1.6,
                          fontSize: "17px",
                          fontWeight: 400,
                        }}
                      >
                        {formatEmailText(msg.response)}
                      </Typography>
                      {msg.citation && (
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            mt: 2.5,
                            pt: 2,
                            borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                            color: "#86868b",
                            fontSize: "13px",
                          }}
                        >
                          Source: {msg.citation}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Box>
              </Box>
            ))}
          </Stack>
        ) : (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height="100%"
          >
            <Typography
              variant="body1"
              sx={{
                color: "#86868b",
                fontSize: "17px",
                textAlign: "center",
              }}
            >
              No conversation yet. Enter a customer inquiry to get started.
            </Typography>
          </Box>
        )}
      </Box>

      <Snackbar
        open={copySuccess}
        autoHideDuration={2500}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity="success"
          sx={{
            width: "100%",
            borderRadius: "12px",
            fontSize: "15px",
            backgroundColor: "#06c",
            color: "white",
            "& .MuiAlert-icon": {
              color: "white",
            },
          }}
        >
          Copied to clipboard
        </Alert>
      </Snackbar>
    </>
  );
};

Chat.propTypes = { history: PropTypes.array };
Chat.defaultProps = { history: [] };

export default Chat;
