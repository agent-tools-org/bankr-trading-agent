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
        uint256 count = 0;
        for (uint256 i = 0; i < _decisions.length; i++) {
            if (_strEq(_decisions[i].model, model)) {
                count++;
            }
        }

        uint256[] memory indices = new uint256[](count);
        uint256 cursor = 0;
        for (uint256 i = 0; i < _decisions.length; i++) {
            if (_strEq(_decisions[i].model, model)) {
                indices[cursor] = i;
                cursor++;
            }
        }

        return indices;
    }

    function _strEq(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
