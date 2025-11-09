"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkCreateNestedManyWithoutModelInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkWhereUniqueInput_1 = require("../inputs/ChunkWhereUniqueInput");
let ChunkCreateNestedManyWithoutModelInput = class ChunkCreateNestedManyWithoutModelInput {
};
exports.ChunkCreateNestedManyWithoutModelInput = ChunkCreateNestedManyWithoutModelInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkCreateNestedManyWithoutModelInput.prototype, "connect", void 0);
exports.ChunkCreateNestedManyWithoutModelInput = ChunkCreateNestedManyWithoutModelInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkCreateNestedManyWithoutModelInput", {})
], ChunkCreateNestedManyWithoutModelInput);
