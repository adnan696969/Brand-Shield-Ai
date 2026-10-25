package com.brandshield.service;

import com.brandshield.model.ScanResult;
import com.brandshield.model.User;
import com.brandshield.repository.ScanResultRepository;
import com.brandshield.repository.UserRepository;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class DetectionService {

    private static final Logger log = LoggerFactory.getLogger(DetectionService.class);

    private final ScanResultRepository scanResultRepository;
    private final UserRepository userRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${brandshield.ai-service-url:http://localhost:5000/predict}")
    private String aiServicePredictUrl;

    @Autowired
    public DetectionService(
            ScanResultRepository scanResultRepository,
            UserRepository userRepository,
            RestTemplate restTemplate,
            ObjectMapper objectMapper) {
        this.scanResultRepository = scanResultRepository;
        this.userRepository = userRepository;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ScanResult detect(String url, String sourceType, Long userId) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        String trimmedUrl = url.trim();
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("url", trimmedUrl);
        if (sourceType != null && !sourceType.isBlank()) {
            requestBody.put("sourceType", sourceType.trim());
        }

        List<Map<String, Object>> priorPayload = new ArrayList<>();
        if (userId != null) {
            List<ScanResult> priors = scanResultRepository.findTop50ByUser_IdOrderByTimestampDesc(userId);
            for (ScanResult p : priors) {
                Map<String, Object> row = new HashMap<>();
                row.put("url", p.getUrl());
                row.put("result", p.getResult());
                row.put("sourceType", p.getSourceType());
                row.put("score", p.getScore());
                priorPayload.add(row);
            }
        }
        requestBody.put("priorScans", priorPayload);

        String jsonBody = objectMapper.writeValueAsString(requestBody);
        HttpEntity<String> request = new HttpEntity<>(jsonBody, headers);

        log.info("Calling Python AI: POST {} body={}", aiServicePredictUrl, jsonBody);

        PredictionResponse pythonResponse;
        try {
            ResponseEntity<String> responseEntity = restTemplate.exchange(
                    aiServicePredictUrl,
                    HttpMethod.POST,
                    request,
                    String.class);
            String rawBody = responseEntity.getBody();
            log.info("Python API HTTP {} raw response: {}", responseEntity.getStatusCode().value(), rawBody);

            if (rawBody == null || rawBody.isBlank()) {
                throw new Exception("AI service returned an empty body.");
            }
            pythonResponse = objectMapper.readValue(rawBody, PredictionResponse.class);
        } catch (ResourceAccessException e) {
            log.error("Python AI unreachable at {}", aiServicePredictUrl, e);
            throw new Exception("AI service unreachable. Start the Python service on port 5000.", e);
        } catch (HttpStatusCodeException e) {
            log.warn("Python AI error status={} body={}", e.getStatusCode().value(), e.getResponseBodyAsString());
            throw new Exception(extractErrorFromAiBody(e), e);
        }

        if (pythonResponse == null) {
            throw new Exception("Failed to parse prediction from AI service.");
        }
        if (pythonResponse.getReasons() == null) {
            pythonResponse.setReasons(List.of());
        }
        if (pythonResponse.getResult() == null || pythonResponse.getResult().isBlank()) {
            throw new Exception("AI service returned no result field.");
        }
        int score = pythonResponse.getScore() != null ? pythonResponse.getScore() : 0;
        String detectedType = pythonResponse.getType() != null
                ? pythonResponse.getType().trim()
                : null;

        User user = null;
        if (userId != null) {
            Optional<User> userOpt = userRepository.findById(userId);
            if (userOpt.isPresent()) {
                user = userOpt.get();
            }
        }

        ScanResult scanResult = new ScanResult(
                trimmedUrl,
                pythonResponse.getResult().trim(),
                detectedType,
                score,
                pythonResponse.getReasons(),
                user
        );
        scanResult.setSymmetricAi(pythonResponse.getSymmetricAi());

        return scanResultRepository.save(scanResult);
    }

    private String extractErrorFromAiBody(HttpStatusCodeException e) {
        String body = e.getResponseBodyAsString();
        if (body != null && !body.isBlank()) {
            try {
                JsonNode node = objectMapper.readTree(body);
                if (node.has("error") && node.get("error").isTextual()) {
                    return node.get("error").asText();
                }
            } catch (Exception ignored) {
                // fall through
            }
            return body.length() > 200 ? body.substring(0, 200) + "…" : body;
        }
        return "AI service returned " + e.getStatusCode().value();
    }

    @Transactional(readOnly = true)
    public List<ScanResult> getHistory(Long userId) {
        return scanResultRepository.findByUser_IdOrderByTimestampDesc(userId);
    }
    
    /** Maps Python /predict JSON: { "type", "result", "score", "reasons" } */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PredictionResponse {
        private String type;
        private String result;
        private Integer score;
        private List<String> reasons;
        private Map<String, Object> symmetricAi;

        public Map<String, Object> getSymmetricAi() {
            return symmetricAi;
        }

        public void setSymmetricAi(Map<String, Object> symmetricAi) {
            this.symmetricAi = symmetricAi;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getResult() {
            return result;
        }

        public void setResult(String result) {
            this.result = result;
        }

        public Integer getScore() {
            return score;
        }

        public void setScore(Integer score) {
            this.score = score;
        }

        public List<String> getReasons() {
            return reasons;
        }

        public void setReasons(List<String> reasons) {
            this.reasons = reasons;
        }
    }
}
