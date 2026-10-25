package com.brandshield.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "scan_results")
public class ScanResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 1000)
    private String url;

    @Column(nullable = false)
    private String result;

    /** WEBSITE | SOCIAL_MEDIA | PRODUCT (from AI service auto-detection) */
    @Column(length = 32)
    private String sourceType;

    @Column(nullable = false)
    private int score;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "scan_result_reasons", joinColumns = @JoinColumn(name = "scan_result_id"))
    @Column(name = "reason_text", length = 2000)
    private List<String> reasons;

    @Column(nullable = false)
    private LocalDateTime timestamp;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    /** Symmetric AI metadata from latest Python response (not persisted). */
    @Transient
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Map<String, Object> symmetricAi;

    // Constructors
    public ScanResult() {}

    public ScanResult(String url, String result, int score, List<String> reasons, User user) {
        this(url, result, null, score, reasons, user);
    }

    public ScanResult(String url, String result, String sourceType, int score, List<String> reasons, User user) {
        this.url = url;
        this.result = result;
        this.sourceType = sourceType;
        this.score = score;
        this.reasons = reasons;
        this.user = user;
        this.timestamp = LocalDateTime.now();
    }

    // Getters & Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public String getResult() { return result; }
    public void setResult(String result) { this.result = result; }

    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }

    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }

    public List<String> getReasons() { return reasons; }
    public void setReasons(List<String> reasons) { this.reasons = reasons; }

    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public Map<String, Object> getSymmetricAi() { return symmetricAi; }
    public void setSymmetricAi(Map<String, Object> symmetricAi) { this.symmetricAi = symmetricAi; }
}
