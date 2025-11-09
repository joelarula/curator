"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkScalarFieldEnum = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
var ChunkScalarFieldEnum;
(function (ChunkScalarFieldEnum) {
    ChunkScalarFieldEnum["id"] = "id";
    ChunkScalarFieldEnum["text"] = "text";
    ChunkScalarFieldEnum["hash"] = "hash";
    ChunkScalarFieldEnum["selection"] = "selection";
    ChunkScalarFieldEnum["fileId"] = "fileId";
    ChunkScalarFieldEnum["modelId"] = "modelId";
})(ChunkScalarFieldEnum || (exports.ChunkScalarFieldEnum = ChunkScalarFieldEnum = {}));
TypeGraphQL.registerEnumType(ChunkScalarFieldEnum, {
    name: "ChunkScalarFieldEnum",
    description: undefined,
});
