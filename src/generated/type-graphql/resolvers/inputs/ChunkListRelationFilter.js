"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkListRelationFilter = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkWhereInput_1 = require("../inputs/ChunkWhereInput");
let ChunkListRelationFilter = class ChunkListRelationFilter {
};
exports.ChunkListRelationFilter = ChunkListRelationFilter;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereInput_1.ChunkWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkWhereInput_1.ChunkWhereInput)
], ChunkListRelationFilter.prototype, "every", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereInput_1.ChunkWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkWhereInput_1.ChunkWhereInput)
], ChunkListRelationFilter.prototype, "some", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereInput_1.ChunkWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkWhereInput_1.ChunkWhereInput)
], ChunkListRelationFilter.prototype, "none", void 0);
exports.ChunkListRelationFilter = ChunkListRelationFilter = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkListRelationFilter", {})
], ChunkListRelationFilter);
