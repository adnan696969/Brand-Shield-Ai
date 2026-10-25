package com.brandshield.service;

import com.brandshield.model.User;
import com.brandshield.repository.UserRepository;
import org.mindrot.jbcrypt.BCrypt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class AuthService {

    private final UserRepository userRepository;

    @Autowired
    public AuthService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User signup(String name, String email, String password) throws Exception {
        if (userRepository.findByEmail(email).isPresent()) {
            throw new Exception("Email already exists");
        }
        
        String hashedPassword = BCrypt.hashpw(password, BCrypt.gensalt());
        User user = new User(name, email, hashedPassword);
        return userRepository.save(user);
    }

    public User login(String email, String password) throws Exception {
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            throw new Exception("Invalid email or password");
        }
        
        User user = userOpt.get();
        if (!BCrypt.checkpw(password, user.getPassword())) {
            throw new Exception("Invalid email or password");
        }
        
        return user;
    }
}
