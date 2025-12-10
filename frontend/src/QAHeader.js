import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import { Typography } from "@mui/material";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import PropTypes from "prop-types";

export const QAHeader = (props) => {
  const { setSelectedModel, modelList, selectedModel, baseUrl } =
    props;

  return (
    <Box>
      <Typography
        variant="h6"
        sx={{
          fontSize: "20px",
          fontWeight: 600,
          color: "#1d1d1f",
          mb: 2.5,
          letterSpacing: "-0.3px",
        }}
      >
        Model Configuration
      </Typography>
      <Alert
        severity="info"
        icon={false}
        sx={{
          borderRadius: "12px",
          mb: 3,
          backgroundColor: "#f5f5f7",
          border: "1px solid rgba(0, 0, 0, 0.06)",
          color: "#1d1d1f",
          "& .MuiAlert-message": {
            fontSize: "15px",
            padding: "4px 0",
          },
        }}
      >
        Using Claude 3 Haiku. Ensure you have access in AWS.{" "}
        <a
          href="https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-supported.html"
          target="_blank"
          rel="noreferrer"
          style={{
            color: "#06c",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          View models
        </a>
      </Alert>
      <Autocomplete
        disabled={!baseUrl}
        includeInputInList
        id="model-select"
        autoComplete
        options={modelList}
        getOptionLabel={(option) => option.modelId ?? option}
        renderOption={(props, option) => (
          <Typography
            {...props}
            sx={{
              fontSize: "17px",
              color: "#1d1d1f",
              padding: "10px 16px",
            }}
          >
            {option.modelName} : {option.modelId}
          </Typography>
        )}
        sx={{ width: "100%" }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="AI Model"
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
        )}
        defaultValue={null}
        value={selectedModel?.modelId ?? null}
        onChange={(_event, value) => {
          setSelectedModel(value);
        }}
      />
    </Box>
  );
};

QAHeader.propTypes = {
  setSelectedModel: PropTypes.func.isRequired,
  modelList: PropTypes.array,
  selectedModel: PropTypes.object,
  baseUrl: PropTypes.string,
};

QAHeader.defaultProps = {
  modelList: [],
  selectedModel: null,
  baseUrl: "",
};
