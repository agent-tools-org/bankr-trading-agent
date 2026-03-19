// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MultiModelTradeLog
/// @notice On-chain log for multi-model trading decisions
contract MultiModelTradeLog {
    struct Decision {
        address agent;
        string model;
        string action;
        string pair;
        uint256 confidence;
        string reasoning;
        uint256 timestamp;
    }

    Decision[] private _decisions;
    // Indices of decisions grouped by `keccak256(model)` to avoid unbounded iteration.
    mapping(bytes32 => uint256[]) private _indicesByModelHash;

    event DecisionLogged(
        address indexed agent,
        string model,
        string action,
        string pair,
        uint256 confidence
    );

    /// @notice Log a new trading decision
    function logDecision(
        string calldata model,
        string calldata action,
        string calldata pair,
        uint256 confidence,
        string calldata reasoning
    ) external {
        uint256 index = _decisions.length;

        _decisions.push(
            Decision({
                agent: msg.sender,
                model: model,
                action: action,
                pair: pair,
                confidence: confidence,
                reasoning: reasoning,
                timestamp: block.timestamp
            })
        );

        _indicesByModelHash[keccak256(bytes(model))].push(index);
        emit DecisionLogged(msg.sender, model, action, pair, confidence);
    }

    /// @notice Get total number of logged decisions
    function getDecisionCount() external view returns (uint256) {
        return _decisions.length;
    }

    /// @notice Get a decision by index
    function getDecision(uint256 index) external view returns (Decision memory) {
        require(index < _decisions.length, "Index out of bounds");
        return _decisions[index];
    }

    /// @notice Get indices of decisions matching a given model name
    function getDecisionsByModel(string calldata model) external view returns (uint256[] memory) {
        return _indicesByModelHash[keccak256(bytes(model))];
    }
}
