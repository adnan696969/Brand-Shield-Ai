package com.brandshield.repository;

import com.brandshield.model.ScanResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScanResultRepository extends JpaRepository<ScanResult, Long> {
    List<ScanResult> findByUser_IdOrderByTimestampDesc(Long userId);

    /** Recent scans for Symmetric AI learning (bounded). */
    List<ScanResult> findTop50ByUser_IdOrderByTimestampDesc(Long userId);
}
