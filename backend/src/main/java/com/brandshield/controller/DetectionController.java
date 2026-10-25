package com.brandshield.controller;

import com.brandshield.model.ScanResult;
import com.brandshield.service.DetectionService;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class DetectionController {

    private static final Logger log = LoggerFactory.getLogger(DetectionController.class);

    private final DetectionService detectionService;

    @Autowired
    public DetectionController(DetectionService detectionService) {
        this.detectionService = detectionService;
    }

    @PostMapping(value = "/detect", consumes = "application/json", produces = "application/json")
    public ResponseEntity<?> detect(
            @RequestBody(required = false) DetectRequest request,
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        try {
            if (userId == null) {
                log.warn("/api/detect rejected: missing X-User-Id header");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Authentication required"));
            }
            if (request == null) {
                log.warn("/api/detect rejected: empty or missing JSON body");
                return ResponseEntity.badRequest().body(Map.of("error", "JSON body required: { \"url\": \"...\" }"));
            }
            if (request.getUrl() == null || request.getUrl().trim().isEmpty()) {
                log.warn("/api/detect rejected: url missing or blank");
                return ResponseEntity.badRequest().body(Map.of("error", "URL is required"));
            }

            String url = request.getUrl().trim();
            String sourceType = request.getSourceType() != null
                    ? request.getSourceType().trim()
                    : null;
            log.info("/api/detect received: url=\"{}\" sourceType={} userId={}", url, sourceType, userId);

            ScanResult result = detectionService.detect(url, sourceType, userId);
            log.info("/api/detect returning id={} result={} score={}", result.getId(), result.getResult(), result.getScore());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("/api/detect failed", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/history")
    public ResponseEntity<?> getHistory(
            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        try {
            if (userId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "User ID is required (sign in again)."));
            }
            List<ScanResult> history = detectionService.getHistory(userId);
            return ResponseEntity.ok(history);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DetectRequest {
        @JsonProperty("url")
        private String url;

        @JsonProperty("sourceType")
        private String sourceType;

        public String getUrl() {
            return url;
        }

        public void setUrl(String url) {
            this.url = url;
        }

        public String getSourceType() {
            return sourceType;
        }

        public void setSourceType(String sourceType) {
            this.sourceType = sourceType;
        }
    }
}
